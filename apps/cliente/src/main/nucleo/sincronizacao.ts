/**
 * Motor de sincronização (docs/07-sincronizacao.md): envia a fila em ordem, um item por vez (D-12), recebe o
 * que mudou no servidor (D-13) e sobe os logs do aparelho. Só roda um ciclo por vez; um pedido que chega no meio
 * roda uma vez logo depois.
 */
import type { LogLocal } from '../../comum/contrato';
import type { RespostaDoPull } from '@compartilhado/tipos';
import type { Auditoria } from './auditoria';
import type { BancoLocal } from './banco';
import { type Comando, type ContextoDosComandos, comandoPara } from './comandos';
import type { EstadoConectividade } from './conectividade';
import { type ClienteHttp, ErroCancelado, ErroDeRede, ErroOffline, type OpcoesHttp, type RespostaHttp } from './http';
import type { RepositorioConfig } from './repositorios/config';
import type { RepositorioLogs } from './repositorios/logs';
import type { RepositorioMedicamentos } from './repositorios/medicamentos';
import type { LinhaDaFila, RepositorioOutbox } from './repositorios/outbox';
import { ErroPrecisaLoginOnline, type GerenciadorDeSessao } from './sessao';

export type TipoDeCiclo = 'COMPLETO' | 'ENVIO';

/** Espera crescente entre tentativas: 5 s, 10 s, 20 s, 40 s… até 5 min (docs/07, seção 7.4). */
export function esperaDaTentativa(tentativasAnteriores: number): number {
  return Math.min(5_000 * 2 ** tentativasAnteriores, 300_000);
}

const TAMANHO_DO_LOTE_DE_LOGS = 500;
const ERROS_DEFINITIVOS = new Set([400, 403, 404, 409, 422]);
/** Um 500 vira definitivo na 3ª tentativa, para um item com problema não travar a fila (D-12). */
const MAXIMO_DE_TENTATIVAS_COM_500 = 3;
/** Falha do servidor de e-mail: 3 tentativas, sem travar a fila (D-39). */
const MAXIMO_DE_TENTATIVAS_DO_EMAIL = 3;

type ResultadoDoItem = 'SEGUIR' | 'PARAR';

interface Dependencias extends ContextoDosComandos {
  banco: BancoLocal;
  outbox: RepositorioOutbox;
  medicamentos: RepositorioMedicamentos;
  config: RepositorioConfig;
  logs: RepositorioLogs;
  auditoria: Auditoria;
  http: ClienteHttp;
  sessao: GerenciadorDeSessao;
  conectividade: EstadoConectividade;
  agora: () => Date;
  dispositivo: () => { id: string; nome: string } | null;
  aoMudar: (oQue: 'estado' | 'dados') => void;
}

export class MotorDeSincronizacao {
  servidorAcessivel = true;
  sincronizando = false;
  private cadeia: Promise<void> = Promise.resolve();
  private esperando: { tipo: TipoDeCiclo; promessa: Promise<void> } | null = null;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private falhasDeRedeSeguidas = 0;
  private parado = false;

  constructor(private readonly d: Dependencias) {
    // Padrão Observer: a chave avisa o motor. Online → sincroniza; Offline → nada mais sai do aparelho
    d.conectividade.assinar((modo) => {
      if (modo === 'ONLINE') {
        this.falhasDeRedeSeguidas = 0;
        void this.sincronizar('COMPLETO');
      } else {
        this.cancelarAgendamento();
        this.servidorAcessivel = true;
        d.aoMudar('estado');
      }
    });
  }

  /** Pede um ciclo. Se um já está rodando, este roda uma vez logo depois (e vários pedidos viram um só). */
  sincronizar(tipo: TipoDeCiclo): Promise<void> {
    if (this.esperando) {
      if (tipo === 'COMPLETO') this.esperando.tipo = 'COMPLETO';
      return this.esperando.promessa;
    }
    const esperando: { tipo: TipoDeCiclo; promessa: Promise<void> } = { tipo, promessa: Promise.resolve() };
    this.esperando = esperando;
    esperando.promessa = this.cadeia.then(async () => {
      this.esperando = null;
      try {
        await this.ciclo(esperando.tipo);
      } catch (erro) {
        console.error('[sincronizacao] erro inesperado', erro);
      }
    });
    this.cadeia = esperando.promessa;
    return esperando.promessa;
  }

  /** O app vai fechar: nenhum ciclo novo começa, e o que está rodando termina antes. */
  async parar(): Promise<void> {
    this.parado = true;
    this.cancelarAgendamento();
    await this.cadeia;
  }

  private async ciclo(tipo: TipoDeCiclo): Promise<void> {
    if (this.parado || !this.d.conectividade.online || !this.d.sessao.ativa) return;
    const completo = tipo === 'COMPLETO';
    this.cancelarAgendamento();
    this.sincronizando = true;
    this.d.aoMudar('estado');
    if (completo) this.d.auditoria.registrar('SINCRONIZACAO_INICIADA');
    let tudoCerto = false;
    let motivoDaFalha: string | null = null;
    try {
      const envio = await this.enviarFila();
      if (completo && envio === 'SEGUIR') {
        await this.receber();
        await this.enviarLogs();
        tudoCerto = true;
      }
      this.falhasDeRedeSeguidas = 0;
    } catch (erro) {
      if (erro instanceof ErroOffline || erro instanceof ErroCancelado) {
        // A chave foi para Offline: nada a fazer, a fila espera
      } else if (erro instanceof ErroDeRede) {
        this.servidorAcessivel = false;
        this.falhasDeRedeSeguidas += 1;
        motivoDaFalha = erro.message;
      } else if (erro instanceof ErroPrecisaLoginOnline) {
        motivoDaFalha = erro.message;
      } else {
        motivoDaFalha = erro instanceof Error ? erro.message : String(erro);
        console.error('[sincronizacao] falha', erro);
      }
    } finally {
      this.sincronizando = false;
      if (completo) {
        if (tudoCerto) {
          this.d.config.gravar('ultima_sincronizacao_em', this.d.agora().toISOString());
          this.d.auditoria.registrar('SINCRONIZACAO_CONCLUIDA');
        } else if (motivoDaFalha) {
          this.d.auditoria.registrar('SINCRONIZACAO_FALHOU', { motivo: motivoDaFalha });
        }
      }
      this.agendarProximaTentativa(tipo);
      this.d.aoMudar('estado');
      this.d.aoMudar('dados');
    }
  }

  // ------------------------------------------------------------------ envio (push)

  private async enviarFila(): Promise<ResultadoDoItem> {
    for (;;) {
      const item = this.proximoItem();
      if (item === 'BLOQUEADA') return 'PARAR';
      if (!item) return 'SEGUIR';
      if ((await this.enviarItem(item)) === 'PARAR') return 'PARAR';
    }
  }

  /** O próximo item na ordem. Um item esperando nova tentativa trava a fila, menos o de e-mail (D-39). */
  private proximoItem(): LinhaDaFila | 'BLOQUEADA' | null {
    const agora = this.d.agora().getTime();
    for (const item of this.d.outbox.pendentes()) {
      const esperando = item.proxima_tentativa_em !== null && Date.parse(item.proxima_tentativa_em) > agora;
      if (!esperando) return item;
      if (item.tipo !== 'ENVIAR_EMAIL') return 'BLOQUEADA';
    }
    return null;
  }

  private async enviarItem(item: LinhaDaFila): Promise<ResultadoDoItem> {
    const comando = comandoPara(item);
    const { rota, corpo } = comando.requisicao();
    this.d.outbox.marcarEnviando(item.id);
    this.d.aoMudar('estado');

    let resposta: RespostaHttp;
    try {
      resposta = await this.comToken(rota, { metodo: 'POST', corpo });
    } catch (erro) {
      if (erro instanceof ErroOffline || erro instanceof ErroCancelado) {
        this.d.outbox.devolver(item.id);
        return 'PARAR';
      }
      if (erro instanceof ErroDeRede) {
        this.adiar(item, erro.message);
        throw erro;
      }
      this.d.outbox.devolver(item.id);
      throw erro;
    }

    const status = resposta.status;
    if (status >= 200 && status < 300) {
      this.d.banco.transacao(() => {
        const guardar = comando.aplicar(resposta, this.d);
        this.d.outbox.concluir(item.id, this.d.agora().toISOString(), guardar);
      });
      this.d.aoMudar('dados');
      return 'SEGUIR';
    }

    const descricao = descreverErro(resposta);
    if (status === 401) {
      // O token foi recusado mesmo depois de renovar: espera um login online
      this.d.outbox.devolver(item.id);
      this.d.sessao.descartarToken();
      return 'PARAR';
    }
    if (ERROS_DEFINITIVOS.has(status)) {
      this.falharDeVez(item, comando, descricao);
      return 'SEGUIR';
    }
    if (status === 502 && item.tipo === 'ENVIAR_EMAIL' && resposta.erro?.erro === 'FALHA_ENVIO_EMAIL') {
      if (item.tentativas + 1 >= MAXIMO_DE_TENTATIVAS_DO_EMAIL) this.falharDeVez(item, comando, descricao);
      else this.adiar(item, descricao);
      return 'SEGUIR';
    }
    if (status === 500) {
      if (item.tentativas + 1 >= MAXIMO_DE_TENTATIVAS_COM_500) {
        this.falharDeVez(item, comando, descricao);
        return 'SEGUIR';
      }
      this.adiar(item, descricao);
      return 'PARAR';
    }
    // 408, 429, 502, 503, 504...: temporário. Para a fila, para não furar a ordem
    this.adiar(item, descricao);
    if (status === 502 || status === 503 || status === 504) this.servidorAcessivel = false;
    return 'PARAR';
  }

  private adiar(item: LinhaDaFila, erro: string): void {
    const quando = new Date(this.d.agora().getTime() + esperaDaTentativa(item.tentativas)).toISOString();
    this.d.outbox.adiar(item.id, erro, quando);
  }

  private falharDeVez(item: LinhaDaFila, comando: Comando, erro: string): void {
    this.d.banco.transacao(() => {
      this.d.outbox.falhar(item.id, erro);
      comando.aoFalhar(this.d);
      this.d.auditoria.registrar('ITEM_COM_ERRO', { itemId: item.id, tipo: item.tipo, entidadeId: item.entidade_id, erro });
    });
    this.d.aoMudar('dados');
  }

  // ------------------------------------------------------------------ recebimento (pull)

  private async receber(): Promise<void> {
    const cursor = this.d.config.ler('cursor_pull');
    const resposta = await this.comToken<RespostaDoPull>('/sync/pull', { consulta: { desde: cursor } });
    if (resposta.status !== 200) throw new ErroDeRede(`"receber dados" respondeu ${resposta.status}`);
    const dados = resposta.corpo;
    this.d.banco.transacao(() => {
      for (const medicamento of dados.medicamentos) this.d.medicamentos.gravarDoServidor(medicamento);
      for (const pessoa of dados.pessoas) this.d.pessoas.gravarDoServidor(pessoa);
      for (const prontuario of dados.prontuarios) this.d.prontuarios.gravarDoServidor(prontuario);
      for (const atendimento of dados.atendimentos) this.d.atendimentos.gravarDoServidor(atendimento);
      // Unificações feitas no servidor (inclusive de uma resposta que se perdeu): o descartado sai do aparelho
      for (const u of dados.unificacoes) {
        if (u.entidade === 'PESSOA') this.d.pessoas.unificar(u.idDescartado, u.idMantido);
        else this.d.prontuarios.unificar(u.idDescartado, u.idMantido);
      }
      this.d.config.gravar('cursor_pull', dados.cursor);
    });
    this.d.aoMudar('dados');
  }

  // ------------------------------------------------------------------ logs do aparelho

  private async enviarLogs(): Promise<void> {
    const dispositivo = this.d.dispositivo();
    if (!dispositivo) return;
    for (;;) {
      const lote = this.d.logs.naoEnviados(TAMANHO_DO_LOTE_DE_LOGS);
      if (lote.length === 0) return;
      const resposta = await this.comToken('/log', {
        metodo: 'POST',
        corpo: { logs: lote.map((log) => paraEnvio(log, dispositivo)) },
      });
      if (resposta.status >= 500 || resposta.status === 401) throw new ErroDeRede(`envio dos logs respondeu ${resposta.status}`);
      if (resposta.status >= 400) console.error('[sincronizacao] lote de logs recusado', resposta.corpo);
      // Recebido (ou recusado de vez): não tenta o mesmo lote para sempre
      this.d.logs.marcarEnviados(
        lote.map((l) => l.id),
        this.d.agora().toISOString(),
      );
    }
  }

  // ------------------------------------------------------------------ apoio

  /** Requisição com o token; se o servidor recusar o token (401), renova uma vez e repete. */
  private async comToken<T>(rota: string, opcoes: OpcoesHttp): Promise<RespostaHttp<T>> {
    let resposta = await this.d.http.requisitar<T>(rota, { ...opcoes, token: await this.d.sessao.token() });
    this.servidorAcessivel = true;
    if (resposta.status === 401) {
      this.d.sessao.descartarToken();
      resposta = await this.d.http.requisitar<T>(rota, { ...opcoes, token: await this.d.sessao.token() });
    }
    return resposta;
  }

  /** Próxima tentativa: a do item que espera, ou (sem resposta do servidor) a do ciclo inteiro. */
  private agendarProximaTentativa(tipo: TipoDeCiclo): void {
    this.cancelarAgendamento();
    if (this.parado || !this.d.conectividade.online || !this.d.sessao.ativa) return;
    const agora = this.d.agora().getTime();
    let quando: number | null = null;
    let proximoTipo: TipoDeCiclo = 'ENVIO';
    const proxima = this.d.outbox.proximaTentativa();
    if (proxima) quando = Math.max(Date.parse(proxima), agora + 1_000);
    if (!this.servidorAcessivel && this.falhasDeRedeSeguidas > 0) {
      const espera = agora + esperaDaTentativa(this.falhasDeRedeSeguidas - 1);
      if (quando === null || espera < quando) quando = espera;
      proximoTipo = tipo;
    }
    if (quando === null) return;
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.sincronizar(proximoTipo);
    }, quando - agora);
    this.temporizador.unref?.();
  }

  private cancelarAgendamento(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
  }
}

function descreverErro(resposta: RespostaHttp): string {
  const erro = resposta.erro;
  if (!erro) return `HTTP ${resposta.status}`;
  const detalhes = erro.detalhes?.length ? ` (${erro.detalhes.map((d) => `${d.campo}: ${d.mensagem}`).join('; ')})` : '';
  return `${erro.erro}: ${erro.mensagem}${detalhes}`;
}

function paraEnvio(log: LogLocal, dispositivo: { id: string; nome: string }) {
  return {
    id: log.id,
    profissionalId: log.profissionalId,
    dispositivoId: dispositivo.id,
    dispositivoNome: dispositivo.nome.slice(0, 100),
    dataHora: log.dataHora,
    acao: log.acao,
    modo: log.modo,
    detalhes: log.detalhes,
  };
}
