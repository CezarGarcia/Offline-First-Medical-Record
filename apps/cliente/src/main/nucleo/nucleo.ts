/**
 * O núcleo local do app cliente (docs/04, seção 4.2): junta o banco, os repositórios, a chave Online/Offline,
 * a sessão, a fila e o motor de sincronização, e é a única porta de entrada das telas (pelo IPC do Electron).
 * Não depende do Electron: o cofre, a janela de "salvar como" e a rede chegam de fora, o que permite testar
 * tudo com o Node.js puro.
 */
import { numeroDaFicha } from '@compartilhado/formatos';
import { uuid7 } from '@compartilhado/ids';
import type { Medicamento, Modo } from '@compartilhado/tipos';
import type { DadosAtendimento, DadosPessoa, DadosProntuario } from '@compartilhado/validacao';
import type {
  ApiDoNucleo,
  AtendimentoDetalheLocal,
  AtendimentoLocal,
  AtendimentoResumoLocal,
  DadosDaConfiguracao,
  DadosDoLogin,
  DestinatarioDoEmail,
  EstadoDoApp,
  EventoDoNucleo,
  ItemDaFila,
  LogLocal,
  PacienteDetalhe,
  PedidoDeEmailLocal,
  PessoaLocal,
  ProntuarioLocal,
  ResultadoDoLogin,
} from '../../comum/contrato';
import { Auditoria } from './auditoria';
import { BancoLocal } from './banco';
import { comandoPara } from './comandos';
import { EstadoConectividade } from './conectividade';
import { ErroDoNucleo } from './erros';
import { ClienteHttp, type Dispositivo, ErroDeRede, normalizarEnderecoDoServidor } from './http';
import { ServicoDeRegistros } from './registros';
import { RepositorioAtendimentos } from './repositorios/atendimentos';
import { RepositorioConfig } from './repositorios/config';
import { RepositorioCredenciais } from './repositorios/credenciais';
import { RepositorioCredenciaisDoServidor } from './repositorios/credenciais-do-servidor';
import { RepositorioLogs } from './repositorios/logs';
import { RepositorioMedicamentos } from './repositorios/medicamentos';
import { RepositorioOutbox } from './repositorios/outbox';
import { RepositorioPessoas } from './repositorios/pessoas';
import { RepositorioProntuarios } from './repositorios/prontuarios';
import { RepositorioSessao } from './repositorios/sessao';
import { type Cofre, ErroPrecisaLoginOnline, GerenciadorDeSessao } from './sessao';
import { MotorDeSincronizacao } from './sincronizacao';

export interface OpcoesDoNucleo {
  caminhoDoBanco: string;
  perfil: string;
  versao: string;
  cofre: Cofre;
  /** Pergunta onde salvar o PDF e grava. Devolve o caminho, ou null se a pessoa cancelou. */
  salvarArquivo: (nomeSugerido: string, conteudo: Uint8Array) => Promise<string | null>;
  buscar?: typeof fetch;
  agora?: () => Date;
  /** Avisa as telas (pelo IPC). */
  aoAvisar?: (evento: EventoDoNucleo) => void;
}

export class Nucleo implements ApiDoNucleo {
  readonly banco: BancoLocal;
  /** Os repositórios do banco local (padrão Repository). */
  readonly repo: {
    config: RepositorioConfig;
    pessoas: RepositorioPessoas;
    prontuarios: RepositorioProntuarios;
    atendimentos: RepositorioAtendimentos;
    medicamentos: RepositorioMedicamentos;
    outbox: RepositorioOutbox;
    logs: RepositorioLogs;
  };
  readonly conectividade: EstadoConectividade;
  readonly http: ClienteHttp;
  readonly sessao: GerenciadorDeSessao;
  readonly auditoria: Auditoria;
  readonly registros: ServicoDeRegistros;
  readonly motor: MotorDeSincronizacao;
  private readonly agora: () => Date;
  private avisoPendente: ReturnType<typeof setTimeout> | null = null;
  private encerrado = false;

  constructor(private readonly opcoes: OpcoesDoNucleo) {
    this.agora = opcoes.agora ?? (() => new Date());
    this.banco = new BancoLocal(opcoes.caminhoDoBanco);
    this.repo = {
      config: new RepositorioConfig(this.banco),
      pessoas: new RepositorioPessoas(this.banco),
      prontuarios: new RepositorioProntuarios(this.banco),
      atendimentos: new RepositorioAtendimentos(this.banco),
      medicamentos: new RepositorioMedicamentos(this.banco),
      outbox: new RepositorioOutbox(this.banco),
      logs: new RepositorioLogs(this.banco),
    };
    // A posição da chave fica salva e volta igual quando o app é aberto de novo (docs/07, seção 7.2)
    this.conectividade = new EstadoConectividade(this.repo.config.ler('conectividade') === 'OFFLINE' ? 'OFFLINE' : 'ONLINE');
    this.http = new ClienteHttp(
      this.conectividade,
      () => this.repo.config.ler('servidor_url'),
      () => this.dispositivo(),
      opcoes.buscar,
      opcoes.versao,
    );
    this.sessao = new GerenciadorDeSessao({
      http: this.http,
      sessoes: new RepositorioSessao(this.banco),
      credenciais: new RepositorioCredenciais(this.banco),
      credenciaisDoServidor: new RepositorioCredenciaisDoServidor(this.banco),
      auditoria: () => this.auditoria,
      conectividade: this.conectividade,
      cofre: opcoes.cofre,
      agora: this.agora,
      dispositivo: () => this.dispositivo(),
      aoMudar: () => this.avisarEstado(),
    });
    this.auditoria = new Auditoria(this.repo.logs, this.conectividade, () => this.sessao.profissionalAtual?.id ?? null, this.agora);
    this.registros = new ServicoDeRegistros({
      banco: this.banco,
      pessoas: this.repo.pessoas,
      prontuarios: this.repo.prontuarios,
      atendimentos: this.repo.atendimentos,
      medicamentos: this.repo.medicamentos,
      outbox: this.repo.outbox,
      auditoria: this.auditoria,
      conectividade: this.conectividade,
      profissional: () => this.sessao.profissionalAtual,
      dispositivo: () => this.dispositivo(),
      agora: this.agora,
    });
    this.motor = new MotorDeSincronizacao({
      banco: this.banco,
      outbox: this.repo.outbox,
      pessoas: this.repo.pessoas,
      prontuarios: this.repo.prontuarios,
      atendimentos: this.repo.atendimentos,
      medicamentos: this.repo.medicamentos,
      config: this.repo.config,
      logs: this.repo.logs,
      auditoria: this.auditoria,
      http: this.http,
      sessao: this.sessao,
      conectividade: this.conectividade,
      agora: this.agora,
      dispositivo: () => this.dispositivo(),
      aoMudar: (oQue) => (oQue === 'dados' ? this.avisar({ tipo: 'dados' }) : this.avisarEstado()),
    });
    this.conectividade.assinar((modo) => {
      this.repo.config.gravar('conectividade', modo);
      this.auditoria.registrar('CONECTIVIDADE_ALTERADA', { modo });
      this.avisarEstado();
    });
  }

  /** Abertura do app: o que estava "enviando" volta para a fila, a sessão continua e, online, sincroniza. */
  iniciar(): void {
    this.repo.outbox.devolverOsQueEstavamEnviando();
    this.sessao.restaurar();
    if (this.conectividade.online && this.sessao.ativa) void this.motor.sincronizar('COMPLETO');
  }

  /** O app vai fechar: cancela o que estiver saindo (volta para a fila) e fecha o banco. */
  async encerrar(): Promise<void> {
    if (this.encerrado) return;
    this.encerrado = true;
    this.http.cancelarTudo();
    await this.motor.parar();
    if (this.avisoPendente) clearTimeout(this.avisoPendente);
    this.banco.fechar();
  }

  // ------------------------------------------------------------------ estado e configuração

  async estado(): Promise<EstadoDoApp> {
    return this.estadoAtual();
  }

  estadoAtual(): EstadoDoApp {
    const dispositivo = this.dispositivo();
    return {
      versao: this.opcoes.versao,
      perfil: this.opcoes.perfil,
      caminhoDoBanco: this.opcoes.caminhoDoBanco,
      configurado: Boolean(this.repo.config.ler('servidor_url') && dispositivo),
      servidorUrl: this.repo.config.ler('servidor_url'),
      dispositivo,
      conectividade: this.conectividade.atual,
      servidorAcessivel: this.motor.servidorAcessivel,
      sessao: this.sessao.naTela,
      pendentes: this.repo.outbox.contar(['PENDENTE', 'ENVIANDO']),
      itensComErro: this.repo.outbox.contar('ERRO'),
      sincronizando: this.motor.sincronizando,
      ultimaSincronizacaoEm: this.repo.config.ler('ultima_sincronizacao_em'),
      motivoDoFimDaSessao: this.sessao.motivoDoFim,
    };
  }

  async configurar(dados: DadosDaConfiguracao): Promise<void> {
    const url = normalizarEnderecoDoServidor(dados.servidorUrl);
    const nome = dados.dispositivoNome.trim();
    const problemas = [
      ...(url ? [] : [{ campo: 'servidorUrl', mensagem: 'informe o endereço do servidor (ex.: http://IP-DA-VM)' }]),
      ...(nome ? [] : [{ campo: 'dispositivoNome', mensagem: 'campo obrigatório' }]),
      ...(nome.length > 100 ? [{ campo: 'dispositivoNome', mensagem: 'muito longo (máximo 100 caracteres)' }] : []),
    ];
    if (problemas.length) throw ErroDoNucleo.validacao(problemas);
    const anterior = this.repo.config.ler('servidor_url');
    this.banco.transacao(() => {
      this.repo.config.gravar('servidor_url', url);
      this.repo.config.gravar('dispositivo_nome', nome);
      if (!this.repo.config.ler('dispositivo_id')) this.repo.config.gravar('dispositivo_id', uuid7());
      // Outro servidor: o "receber dados" recomeça do zero
      if (anterior && anterior !== url) this.repo.config.gravar('cursor_pull', null);
    });
    this.avisarEstado();
  }

  // ------------------------------------------------------------------ sessão e chave

  async entrar(dados: DadosDoLogin): Promise<ResultadoDoLogin> {
    this.exigirConfiguracao();
    const resultado = await this.sessao.entrar(dados.tipoRegistro, dados.registro, dados.senha);
    this.avisarEstado();
    if (resultado.modo === 'ONLINE') void this.motor.sincronizar('COMPLETO');
    return resultado;
  }

  async confirmarSenhaOnline(senha: string): Promise<void> {
    await this.sessao.confirmarSenhaOnline(senha);
    this.avisarEstado();
    void this.motor.sincronizar('COMPLETO');
  }

  async sair(): Promise<void> {
    await this.sessao.sair();
    this.avisarEstado();
  }

  async mudarConectividade(modo: Modo): Promise<void> {
    this.conectividade.mudar(modo === 'OFFLINE' ? 'OFFLINE' : 'ONLINE');
  }

  /** Botão "Sincronizar": envio, recebimento e logs (docs/07, seção 7.9). */
  async sincronizar(): Promise<void> {
    if (!this.conectividade.online) throw new ErroDoNucleo('OFFLINE', 'Com a chave em Offline, nada sai do aparelho.');
    this.exigirSessao();
    if (this.sessao.precisaLoginOnline) throw new ErroDoNucleo('PRECISA_LOGIN_ONLINE', 'Entre online para sincronizar.');
    await this.motor.sincronizar('COMPLETO');
  }

  // ------------------------------------------------------------------ consultas

  async medicamentosAtivos(): Promise<Medicamento[]> {
    return this.repo.medicamentos.ativos();
  }

  async buscarPessoas(termo: string): Promise<PessoaLocal[]> {
    return this.repo.pessoas.buscarPorTermo(termo ?? '');
  }

  async pessoaComCpf(cpf: string): Promise<PessoaLocal | null> {
    const digitos = (cpf ?? '').replace(/\D/g, '');
    return digitos.length === 11 ? this.repo.pessoas.comCpf(digitos) : null;
  }

  async paciente(pessoaId: string): Promise<PacienteDetalhe | null> {
    const pessoa = this.repo.pessoas.buscar(pessoaId);
    if (!pessoa) return null;
    return { pessoa, prontuarios: this.repo.prontuarios.daPessoa(pessoaId), atendimentos: this.repo.atendimentos.resumos(pessoaId) };
  }

  async atendimentos(): Promise<AtendimentoResumoLocal[]> {
    return this.repo.atendimentos.resumos();
  }

  async atendimento(id: string): Promise<AtendimentoDetalheLocal | null> {
    const atendimento = this.repo.atendimentos.buscar(id);
    if (!atendimento) return null;
    const prontuario = this.repo.prontuarios.buscar(atendimento.prontuarioId);
    const pessoa = prontuario ? this.repo.pessoas.buscar(prontuario.pessoaId) : null;
    if (!prontuario || !pessoa) return null;
    return { ...atendimento, pessoa, prontuario, emails: this.registros.emailsDoAtendimento(id) };
  }

  // ------------------------------------------------------------------ cadastros

  async criarPessoa(dados: DadosPessoa): Promise<PessoaLocal> {
    return this.depoisDeSalvar(this.registros.criarPessoa(dados));
  }

  async criarProntuario(pessoaId: string, dados: DadosProntuario): Promise<ProntuarioLocal> {
    return this.depoisDeSalvar(this.registros.criarProntuario(pessoaId, dados));
  }

  async criarAtendimento(prontuarioId: string, dados: DadosAtendimento): Promise<AtendimentoLocal> {
    return this.depoisDeSalvar(this.registros.criarAtendimento(prontuarioId, dados));
  }

  async pedirEmail(atendimentoId: string, destinatario: DestinatarioDoEmail): Promise<PedidoDeEmailLocal> {
    return this.depoisDeSalvar(this.registros.pedirEmail(atendimentoId, destinatario));
  }

  /** O PDF é gerado no servidor (D-15): só para atendimento sincronizado, e com a chave em Online. */
  async baixarPdf(atendimentoId: string): Promise<{ salvoEm: string } | null> {
    const atendimento = this.repo.atendimentos.buscar(atendimentoId);
    if (!atendimento) throw new ErroDoNucleo('NAO_ENCONTRADO', 'Atendimento não encontrado neste aparelho.');
    if (atendimento.estadoSync !== 'SINCRONIZADO') {
      throw new ErroDoNucleo('NAO_SINCRONIZADO', 'O PDF fica disponível depois que o atendimento for sincronizado.');
    }
    if (!this.conectividade.online) throw new ErroDoNucleo('OFFLINE', 'Para baixar o PDF, a chave precisa estar em Online.');
    let resposta;
    try {
      const token = await this.sessao.token();
      resposta = await this.http.requisitar(`/documentos/ficha/${atendimentoId}/pdf`, { token, binario: true, tempoLimiteMs: 60_000 });
      if (resposta.status === 401) {
        this.sessao.descartarToken();
        resposta = await this.http.requisitar(`/documentos/ficha/${atendimentoId}/pdf`, {
          token: await this.sessao.token(),
          binario: true,
          tempoLimiteMs: 60_000,
        });
      }
    } catch (erro) {
      if (erro instanceof ErroPrecisaLoginOnline) throw new ErroDoNucleo('PRECISA_LOGIN_ONLINE', erro.message);
      if (erro instanceof ErroDeRede) throw new ErroDoNucleo('SERVIDOR_INACESSIVEL', 'Servidor inacessível. Tente de novo em instantes.');
      throw erro;
    }
    if (resposta.status !== 200 || !resposta.bytes) {
      throw new ErroDoNucleo(resposta.erro?.erro ?? 'ERRO_INTERNO', resposta.erro?.mensagem ?? `O servidor respondeu ${resposta.status}.`);
    }
    const nome = nomeDoArquivo(resposta.cabecalhos.get('content-disposition')) ?? `ficha-atendimento-${numeroDaFicha(atendimentoId)}.pdf`;
    const salvoEm = await this.opcoes.salvarArquivo(nome, new Uint8Array(resposta.bytes));
    if (!salvoEm) return null;
    this.auditoria.registrar('PDF_BAIXADO', { atendimentoId });
    this.avisar({ tipo: 'dados' });
    return { salvoEm };
  }

  // ------------------------------------------------------------------ fila e logs

  async fila(): Promise<ItemDaFila[]> {
    return this.repo.outbox.listar((linha) => {
      try {
        return comandoPara(linha).descrever(this.motorContexto());
      } catch {
        return linha.tipo;
      }
    });
  }

  async tentarDeNovo(itemId: string): Promise<void> {
    const item = this.repo.outbox.buscar(itemId);
    if (!item) throw new ErroDoNucleo('NAO_ENCONTRADO', 'Item não encontrado na fila.');
    if (this.repo.outbox.tentarDeNovo(itemId)) {
      // O registro volta a aparecer como pendente até o servidor responder
      if (item.tipo === 'CRIAR_PESSOA') this.repo.pessoas.marcar(item.entidade_id, 'PENDENTE');
      if (item.tipo === 'CRIAR_PRONTUARIO') this.repo.prontuarios.marcar(item.entidade_id, 'PENDENTE');
      if (item.tipo === 'CRIAR_ATENDIMENTO') this.repo.atendimentos.marcar(item.entidade_id, 'PENDENTE');
      this.avisarEstado();
      this.avisar({ tipo: 'dados' });
      if (this.conectividade.online) void this.motor.sincronizar('ENVIO');
    }
  }

  async logsLocais(): Promise<LogLocal[]> {
    return this.repo.logs.listar();
  }

  // ------------------------------------------------------------------ apoio

  dispositivo(): Dispositivo | null {
    const id = this.repo.config.ler('dispositivo_id');
    const nome = this.repo.config.ler('dispositivo_nome');
    return id && nome ? { id, nome } : null;
  }

  private motorContexto() {
    return { pessoas: this.repo.pessoas, prontuarios: this.repo.prontuarios, atendimentos: this.repo.atendimentos, auditoria: this.auditoria };
  }

  private depoisDeSalvar<T>(registro: T): T {
    this.avisarEstado();
    this.avisar({ tipo: 'dados' });
    // Com a chave em Online, sai na hora (docs/07, seção 7.9)
    if (this.conectividade.online) void this.motor.sincronizar('ENVIO');
    return registro;
  }

  private exigirConfiguracao(): void {
    if (!this.repo.config.ler('servidor_url') || !this.dispositivo()) {
      throw new ErroDoNucleo('NAO_CONFIGURADO', 'Configure o endereço do servidor e o nome do dispositivo primeiro.');
    }
  }

  private exigirSessao(): void {
    if (!this.sessao.ativa) throw ErroDoNucleo.semSessao();
  }

  private avisar(evento: EventoDoNucleo): void {
    this.opcoes.aoAvisar?.(evento);
  }

  /** Várias mudanças seguidas viram um aviso só. */
  private avisarEstado(): void {
    if (!this.opcoes.aoAvisar || this.avisoPendente) return;
    this.avisoPendente = setTimeout(() => {
      this.avisoPendente = null;
      this.avisar({ tipo: 'estado', estado: this.estadoAtual() });
    }, 30);
  }
}

function nomeDoArquivo(cabecalho: string | null): string | null {
  return cabecalho?.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
}
