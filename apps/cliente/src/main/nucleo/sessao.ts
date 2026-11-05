/**
 * Sessão e login, online e offline (docs/08-seguranca-e-auditoria.md, seções 8.5 e 8.6).
 *
 * - Login online: o servidor confere a senha; o app guarda um verificador scrypt para o próximo login offline.
 * - Login offline: confere a senha com o verificador deste aparelho ou, para quem nunca entrou online nele, com o
 *   hash da réplica de credenciais recebida na sincronização (D-51). Validade de 7 dias desde a última validação
 *   no servidor, bloqueio de 5 minutos depois de 5 erros seguidos. A senha fica só na memória, para o login
 *   online automático quando a conexão voltar.
 * - Sessão mantida: guardada no SQLite, com o refresh token cifrado pelo cofre do sistema (safeStorage).
 *   O token de acesso (15 min) fica só na memória e é renovado sozinho.
 */
import { hora } from '@compartilhado/formatos';
import type {
  CredencialDoServidor,
  ProfissionalResumo,
  RespostaLogin,
  RespostaRefresh,
  TipoRegistro,
} from '@compartilhado/tipos';
import bcrypt from 'bcryptjs';
import type { ResultadoDoLogin, SessaoNaTela } from '../../comum/contrato';
import type { Auditoria } from './auditoria';
import type { EstadoConectividade } from './conectividade';
import { criarVerificador, senhaConfere } from './credencial';
import { ErroDoNucleo } from './erros';
import { type ClienteHttp, type Dispositivo, ErroDeRede, type RespostaHttp } from './http';
import { type CredencialOffline, type RepositorioCredenciais, registroNormalizado } from './repositorios/credenciais';
import type { CredencialDoServidorLocal, RepositorioCredenciaisDoServidor } from './repositorios/credenciais-do-servidor';
import type { RepositorioSessao, SessaoGuardada } from './repositorios/sessao';

/** Cofre do sistema operacional para guardar o refresh token (no Windows, o DPAPI, pelo safeStorage). */
export interface Cofre {
  /** Conferido uma vez, na abertura do app. */
  disponivel(): boolean;
  cifrar(texto: string): Promise<Uint8Array>;
  decifrar(dados: Uint8Array): Promise<string>;
}

/** Sem sessão no servidor: o app segue funcionando, mas só sincroniza depois de um login online. */
export class ErroPrecisaLoginOnline extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
    this.name = 'ErroPrecisaLoginOnline';
  }
}

const DIA_MS = 24 * 60 * 60 * 1000;
export const VALIDADE_DA_CREDENCIAL_OFFLINE_MS = 7 * DIA_MS;
export const TENTATIVAS_ATE_BLOQUEAR = 5;
export const BLOQUEIO_MS = 5 * 60 * 1000;
/** Renova o token de acesso quando faltam menos de 30 segundos. */
const ANTECEDENCIA_DA_RENOVACAO_MS = 30_000;

export const PRECISA_LOGIN_ONLINE = 'Faça login online para sincronizar.';
export const SESSAO_DO_SERVIDOR_TERMINOU =
  'A sessão no servidor terminou. Os registros continuam guardados; entre online de novo para sincronizar.';

interface Dependencias {
  http: ClienteHttp;
  sessoes: RepositorioSessao;
  credenciais: RepositorioCredenciais;
  credenciaisDoServidor: RepositorioCredenciaisDoServidor;
  auditoria: () => Auditoria;
  conectividade: EstadoConectividade;
  cofre: Cofre;
  agora: () => Date;
  dispositivo: () => Dispositivo | null;
  aoMudar: () => void;
}

/**
 * De onde vem a conferência offline: o verificador criado no login online deste aparelho, ou o hash da réplica
 * recebida do servidor (D-51). Cada uma conta as próprias tentativas erradas.
 */
interface FonteOffline {
  profissional: ProfissionalResumo;
  /** Até quando vale: 7 dias depois da última vez que o servidor confirmou essa credencial. */
  venceEm: number;
  bloqueadoAte: string | null;
  tentativasFalhas: number;
  confere(senha: string): Promise<boolean>;
  registrarFalha(tentativas: number, bloqueadoAte: string | null): void;
  zerarFalhas(): void;
}

const comoProfissional = (c: CredencialOffline | CredencialDoServidorLocal): ProfissionalResumo => ({
  id: c.profissionalId,
  nome: c.nome,
  tipoRegistro: c.tipoRegistro,
  registro: c.registro,
  perfil: c.perfil,
});

export class GerenciadorDeSessao {
  private guardada: SessaoGuardada | null = null;
  private profissional: ProfissionalResumo | null = null;
  private tokenDeAcesso: { valor: string; expiraEm: number } | null = null;
  /** Só depois de um login offline, até o login online automático. Nunca vai para o disco. */
  private senhaEmMemoria: string | null = null;
  private servidorRecusou = false;
  private renovacao: Promise<string> | null = null;
  motivoDoFim: string | null = null;

  constructor(private readonly d: Dependencias) {}

  /** Na abertura do app: a sessão continua de onde parou, se ainda for válida. */
  restaurar(): void {
    const guardada = this.d.sessoes.ler();
    if (!guardada) return;
    const credencial =
      this.d.credenciais.doProfissional(guardada.profissionalId) ?? this.d.credenciaisDoServidor.doProfissional(guardada.profissionalId);
    if (!credencial || Date.parse(guardada.expiraEm) <= this.d.agora().getTime()) {
      this.d.sessoes.apagar();
      this.motivoDoFim = 'A sessão venceu. Entre de novo.';
      return;
    }
    this.guardada = guardada;
    this.profissional = comoProfissional(credencial);
  }

  get ativa(): boolean {
    return this.guardada !== null;
  }

  get profissionalAtual(): ProfissionalResumo | null {
    return this.profissional;
  }

  get naTela(): SessaoNaTela | null {
    if (!this.guardada || !this.profissional) return null;
    return { profissional: this.profissional, modoLogin: this.guardada.modoLogin, precisaLoginOnline: this.precisaLoginOnline };
  }

  /** Não há como conseguir um token sem pedir a senha de novo. */
  get precisaLoginOnline(): boolean {
    if (!this.guardada) return false;
    if (this.tokenDeAcesso || this.senhaEmMemoria) return false;
    return this.servidorRecusou || !this.refreshTokenDisponivel();
  }

  async entrar(tipoRegistro: TipoRegistro, registro: string, senha: string): Promise<ResultadoDoLogin> {
    if (!registro.trim() || !senha) {
      throw ErroDoNucleo.validacao([
        ...(registro.trim() ? [] : [{ campo: 'registro', mensagem: 'campo obrigatório' }]),
        ...(senha ? [] : [{ campo: 'senha', mensagem: 'campo obrigatório' }]),
      ]);
    }
    let aviso: string | null = null;
    if (this.d.conectividade.online) {
      try {
        await this.loginOnline(tipoRegistro, registro, senha);
        return { modo: 'ONLINE', aviso: null };
      } catch (erro) {
        if (!(erro instanceof ErroDeRede)) throw erro;
        aviso = 'Servidor inacessível: entrou em modo offline.';
      }
    }
    await this.loginOffline(tipoRegistro, registro, senha);
    return { modo: 'OFFLINE', aviso };
  }

  /** Sessão sem token (login offline e app reaberto, ou sessão do servidor vencida): só a senha, online. */
  async confirmarSenhaOnline(senha: string): Promise<void> {
    const profissional = this.profissional;
    if (!profissional) throw ErroDoNucleo.semSessao();
    if (!this.d.conectividade.online) {
      throw new ErroDoNucleo('OFFLINE', 'Para entrar online, a chave precisa estar em Online.');
    }
    try {
      await this.loginOnline(profissional.tipoRegistro, profissional.registro, senha, profissional.id);
    } catch (erro) {
      if (erro instanceof ErroDeRede) throw new ErroDoNucleo('SERVIDOR_INACESSIVEL', 'Servidor inacessível. Tente de novo em instantes.');
      throw erro;
    }
  }

  /**
   * A réplica de credenciais recebida na sincronização (D-51): os profissionais ativos, com o hash da senha.
   * O hash vai para o disco cifrado pelo cofre do sistema; sem cofre, a réplica não é guardada. Quem saiu da
   * lista foi desativado no servidor: perde também a credencial deste aparelho e, se estiver logado, a sessão.
   */
  async receberCredenciais(lista: CredencialDoServidor[]): Promise<void> {
    const ativos = new Set(lista.map((p) => p.id));
    for (const desativado of this.d.credenciais.idsGuardados().filter((id) => !ativos.has(id))) this.desativado(desativado);
    if (!this.d.cofre.disponivel()) {
      this.d.credenciaisDoServidor.limpar();
      return;
    }
    const recebidoEm = this.d.agora().toISOString();
    const linhas = [];
    for (const p of lista) {
      linhas.push({
        profissionalId: p.id,
        tipoRegistro: p.tipoRegistro,
        registro: p.registro,
        nome: p.nome,
        perfil: p.perfil,
        senhaHashCifrado: await this.d.cofre.cifrar(p.senhaHash),
        recebidoEm,
      });
    }
    this.d.credenciaisDoServidor.substituir(linhas);
  }

  async sair(): Promise<void> {
    if (!this.guardada) return;
    const profissionalId = this.profissional?.id ?? null;
    if (this.d.conectividade.online && this.tokenDeAcesso) {
      try {
        await this.d.http.requisitar('/auth/logout', { metodo: 'POST', token: this.tokenDeAcesso.valor, tempoLimiteMs: 5000 });
      } catch {
        // Sem resposta: a sessão no servidor vence sozinha; o refresh token sai do aparelho agora
      }
    }
    this.d.auditoria().registrar('LOGOUT', null, profissionalId);
    this.limpar(null);
  }

  /** Um token de acesso válido agora: renova pelo refresh token, ou faz o login online automático. */
  async token(): Promise<string> {
    if (!this.guardada) throw new ErroPrecisaLoginOnline(PRECISA_LOGIN_ONLINE);
    if (this.tokenDeAcesso && this.tokenDeAcesso.expiraEm - this.d.agora().getTime() > ANTECEDENCIA_DA_RENOVACAO_MS) {
      return this.tokenDeAcesso.valor;
    }
    this.renovacao ??= this.renovar().finally(() => {
      this.renovacao = null;
    });
    return this.renovacao;
  }

  /** O servidor recusou o token (401): da próxima vez, renova antes. */
  descartarToken(): void {
    this.tokenDeAcesso = null;
  }

  private async renovar(): Promise<string> {
    const guardada = this.guardada;
    const profissional = this.profissional;
    if (!guardada || !profissional) throw new ErroPrecisaLoginOnline(PRECISA_LOGIN_ONLINE);

    // Depois de um login offline: o login online automático, com a senha que ficou na memória
    if (this.senhaEmMemoria) {
      try {
        await this.loginOnline(profissional.tipoRegistro, profissional.registro, this.senhaEmMemoria, profissional.id);
      } catch (erro) {
        if (erro instanceof ErroDeRede) throw erro;
        this.senhaEmMemoria = null; // a senha mudou no servidor, ou a conta foi bloqueada
        this.d.aoMudar();
        throw new ErroPrecisaLoginOnline(erro instanceof Error ? erro.message : PRECISA_LOGIN_ONLINE);
      }
      return this.tokenDeAcesso?.valor ?? '';
    }

    if (this.servidorRecusou || !guardada.refreshTokenCifrado || !this.d.cofre.disponivel()) {
      throw new ErroPrecisaLoginOnline(this.servidorRecusou ? SESSAO_DO_SERVIDOR_TERMINOU : PRECISA_LOGIN_ONLINE);
    }
    let refreshToken: string;
    try {
      refreshToken = await this.d.cofre.decifrar(guardada.refreshTokenCifrado);
    } catch {
      // O cofre do sistema não abre mais (ex.: outro usuário do Windows): só com a senha de novo
      throw new ErroPrecisaLoginOnline(PRECISA_LOGIN_ONLINE);
    }
    const resposta = await this.d.http.requisitar<RespostaRefresh>('/auth/refresh', { metodo: 'POST', corpo: { refreshToken } });
    if (resposta.status === 200) {
      const agora = this.d.agora().toISOString();
      this.tokenDeAcesso = { valor: resposta.corpo.tokenDeAcesso, expiraEm: Date.parse(resposta.corpo.tokenDeAcessoExpiraEm) };
      // Renovar a sessão conta como validação online: o login offline continua valendo por mais 7 dias
      this.d.credenciais.validarOnline(profissional.id, agora);
      this.guardada = { ...guardada, sessaoServidorExpiraEm: resposta.corpo.sessaoExpiraEm };
      this.d.sessoes.gravar(this.guardada);
      return this.tokenDeAcesso.valor;
    }
    if (resposta.status === 403 && resposta.erro?.erro === 'PROFISSIONAL_INATIVO') {
      this.desativado(profissional.id);
      throw new ErroPrecisaLoginOnline('Este profissional foi desativado no servidor.');
    }
    if (resposta.status === 401) {
      // Sessão vencida ou encerrada no servidor: os dados continuam no aparelho, só a sincronização espera
      this.servidorRecusou = true;
      this.d.aoMudar();
      throw new ErroPrecisaLoginOnline(SESSAO_DO_SERVIDOR_TERMINOU);
    }
    throw new ErroDeRede(`o servidor respondeu ${resposta.status}`);
  }

  private async loginOnline(tipoRegistro: TipoRegistro, registro: string, senha: string, mesmoProfissional?: string): Promise<void> {
    const dispositivo = this.d.dispositivo();
    const resposta: RespostaHttp<RespostaLogin> = await this.d.http.requisitar<RespostaLogin>('/auth/login', {
      metodo: 'POST',
      corpo: {
        tipoRegistro,
        registro: registro.trim(),
        senha,
        ...(dispositivo ? { dispositivo: { id: dispositivo.id, nome: dispositivo.nome } } : {}),
      },
    });
    const auditoria = this.d.auditoria();
    if (resposta.status !== 200) {
      const codigo = resposta.erro?.erro ?? `HTTP_${resposta.status}`;
      if (!resposta.erro || resposta.status >= 500 || resposta.status === 404) {
        throw new ErroDeRede(`o endereço não respondeu como um servidor MedicalField (${resposta.status})`);
      }
      auditoria.registrar('LOGIN_FALHOU', { motivo: codigo, tipoRegistro, registro: registroNormalizado(registro), modo: 'ONLINE' }, null);
      if (codigo === 'PROFISSIONAL_INATIVO') {
        const credencial = this.d.credenciais.buscar(tipoRegistro, registro);
        if (credencial) this.desativado(credencial.profissionalId);
      }
      throw new ErroDoNucleo(codigo, mensagemDoLogin(codigo, resposta.erro.mensagem, resposta.erro.bloqueadoAte), resposta.erro.detalhes ?? [], {
        bloqueadoAte: resposta.erro.bloqueadoAte,
      });
    }

    const { profissional, refreshToken, sessaoExpiraEm } = resposta.corpo;
    if (mesmoProfissional && profissional.id !== mesmoProfissional) {
      throw new ErroDoNucleo('OUTRO_PROFISSIONAL', 'Esse login é de outro profissional.');
    }
    const agora = this.d.agora().toISOString();
    const { verificador, sal } = await criarVerificador(senha);
    this.d.credenciais.salvar({
      profissionalId: profissional.id,
      tipoRegistro: profissional.tipoRegistro,
      registro: profissional.registro,
      nome: profissional.nome,
      perfil: profissional.perfil,
      verificador,
      sal,
      validadoOnlineEm: agora,
    });
    let refreshTokenCifrado: Uint8Array | null = null;
    if (this.d.cofre.disponivel()) {
      try {
        refreshTokenCifrado = await this.d.cofre.cifrar(refreshToken);
      } catch {
        refreshTokenCifrado = null;
      }
    }
    this.guardada = {
      profissionalId: profissional.id,
      modoLogin: 'ONLINE',
      iniciadaEm: agora,
      expiraEm: sessaoExpiraEm,
      refreshTokenCifrado,
      sessaoServidorExpiraEm: sessaoExpiraEm,
    };
    this.d.sessoes.gravar(this.guardada);
    this.profissional = profissional;
    this.tokenDeAcesso = { valor: resposta.corpo.tokenDeAcesso, expiraEm: Date.parse(resposta.corpo.tokenDeAcessoExpiraEm) };
    // Sem cofre no sistema, o refresh token não pode ir para o disco: a senha fica na memória até o app fechar
    this.senhaEmMemoria = refreshTokenCifrado ? null : senha;
    this.servidorRecusou = false;
    this.motivoDoFim = null;
    auditoria.registrar('LOGIN_ONLINE', { tipoRegistro: profissional.tipoRegistro, registro: profissional.registro }, profissional.id);
    this.d.aoMudar();
  }

  private async loginOffline(tipoRegistro: TipoRegistro, registro: string, senha: string): Promise<void> {
    const auditoria = this.d.auditoria();
    const falhou = (motivo: string, profissionalId: string | null = null) =>
      auditoria.registrar('LOGIN_FALHOU', { motivo, tipoRegistro, registro: registroNormalizado(registro), modo: 'OFFLINE' }, profissionalId);

    const agora = this.d.agora();
    const fontes = this.fontesOffline(tipoRegistro, registro);
    if (fontes.length === 0) {
      if (this.d.credenciaisDoServidor.vazia()) {
        // O aparelho nunca sincronizou: não tem com que conferir a senha
        falhou('PRIMEIRO_ACESSO');
        throw new ErroDoNucleo('PRIMEIRO_ACESSO', 'O primeiro acesso neste aparelho precisa de conexão.');
      }
      // A réplica não tem esse registro: a mesma resposta da senha errada, para não revelar quem existe
      falhou('CREDENCIAIS_INVALIDAS');
      throw new ErroDoNucleo('CREDENCIAIS_INVALIDAS', 'Registro ou senha incorretos.');
    }
    // A confirmação mais recente do servidor vale: se a senha mudou, a réplica nova já tem o hash novo
    const validas = fontes.filter((f) => f.venceEm > agora.getTime()).sort((a, b) => b.venceEm - a.venceEm);
    const fonte = validas[0];
    if (!fonte) {
      falhou('CREDENCIAL_VENCIDA', fontes[0]?.profissional.id ?? null);
      throw new ErroDoNucleo(
        'CREDENCIAL_VENCIDA',
        'O login offline deste aparelho venceu (7 dias sem falar com o servidor). Conecte-se e entre online.',
      );
    }
    const profissionalId = fonte.profissional.id;
    if (fonte.bloqueadoAte && Date.parse(fonte.bloqueadoAte) > agora.getTime()) {
      falhou('CONTA_BLOQUEADA', profissionalId);
      throw bloqueado(fonte.bloqueadoAte);
    }
    if (!(await fonte.confere(senha))) {
      const tentativas = fonte.tentativasFalhas + 1;
      if (tentativas >= TENTATIVAS_ATE_BLOQUEAR) {
        const ate = new Date(agora.getTime() + BLOQUEIO_MS).toISOString();
        fonte.registrarFalha(0, ate);
        falhou('CONTA_BLOQUEADA', profissionalId);
        throw bloqueado(ate);
      }
      fonte.registrarFalha(tentativas, null);
      falhou('CREDENCIAIS_INVALIDAS', profissionalId);
      throw new ErroDoNucleo('CREDENCIAIS_INVALIDAS', 'Registro ou senha incorretos.');
    }

    fonte.zerarFalhas();
    this.guardada = {
      profissionalId,
      modoLogin: 'OFFLINE',
      iniciadaEm: agora.toISOString(),
      expiraEm: new Date(fonte.venceEm).toISOString(),
      refreshTokenCifrado: null,
      sessaoServidorExpiraEm: null,
    };
    this.d.sessoes.gravar(this.guardada);
    this.profissional = fonte.profissional;
    this.tokenDeAcesso = null;
    this.senhaEmMemoria = senha;
    this.servidorRecusou = false;
    this.motivoDoFim = null;
    auditoria.registrar('LOGIN_OFFLINE', { tipoRegistro: fonte.profissional.tipoRegistro, registro: fonte.profissional.registro }, profissionalId);
    this.d.aoMudar();
  }

  /** As credenciais com que dá para conferir essa senha sem o servidor (as duas podem existir). */
  private fontesOffline(tipoRegistro: TipoRegistro, registro: string): FonteOffline[] {
    const fontes: FonteOffline[] = [];
    const doAparelho = this.d.credenciais.buscar(tipoRegistro, registro);
    if (doAparelho) {
      const id = doAparelho.profissionalId;
      fontes.push({
        profissional: comoProfissional(doAparelho),
        venceEm: Date.parse(doAparelho.validadoOnlineEm) + VALIDADE_DA_CREDENCIAL_OFFLINE_MS,
        bloqueadoAte: doAparelho.bloqueadoAte,
        tentativasFalhas: doAparelho.tentativasFalhas,
        confere: (senha) => senhaConfere(senha, doAparelho.verificador, doAparelho.sal),
        registrarFalha: (tentativas, ate) => this.d.credenciais.registrarFalha(id, tentativas, ate),
        zerarFalhas: () => this.d.credenciais.zerarFalhas(id),
      });
    }
    const daReplica = this.d.cofre.disponivel() ? this.d.credenciaisDoServidor.buscar(tipoRegistro, registro) : null;
    if (daReplica) {
      const id = daReplica.profissionalId;
      fontes.push({
        profissional: comoProfissional(daReplica),
        venceEm: Date.parse(daReplica.recebidoEm) + VALIDADE_DA_CREDENCIAL_OFFLINE_MS,
        bloqueadoAte: daReplica.bloqueadoAte,
        tentativasFalhas: daReplica.tentativasFalhas,
        confere: async (senha) => {
          let hash: string;
          try {
            hash = await this.d.cofre.decifrar(daReplica.senhaHashCifrado);
          } catch {
            return false; // o cofre não abre mais (ex.: outro usuário do Windows)
          }
          // Como o ms-auth confere no login online: a senha exatamente como foi digitada
          return bcrypt.compare(senha, hash);
        },
        registrarFalha: (tentativas, ate) => this.d.credenciaisDoServidor.registrarFalha(id, tentativas, ate),
        zerarFalhas: () => this.d.credenciaisDoServidor.zerarFalhas(id),
      });
    }
    return fontes;
  }

  private refreshTokenDisponivel(): boolean {
    return Boolean(this.guardada?.refreshTokenCifrado) && this.d.cofre.disponivel();
  }

  /** Desativado no servidor: perde a credencial offline e a sessão neste aparelho (docs/08, seção 8.5). */
  private desativado(profissionalId: string): void {
    this.d.credenciais.apagar(profissionalId);
    this.d.credenciaisDoServidor.apagar(profissionalId);
    if (this.profissional?.id === profissionalId) this.limpar('Este profissional foi desativado no servidor.');
  }

  private limpar(motivo: string | null): void {
    this.d.sessoes.apagar();
    this.guardada = null;
    this.profissional = null;
    this.tokenDeAcesso = null;
    this.senhaEmMemoria = null;
    this.servidorRecusou = false;
    this.motivoDoFim = motivo;
    this.d.aoMudar();
  }
}

function bloqueado(ate: string): ErroDoNucleo {
  return new ErroDoNucleo('CONTA_BLOQUEADA', `Muitas tentativas com senha errada. Bloqueado até ${hora(ate)}.`, [], {
    bloqueadoAte: ate,
  });
}

function mensagemDoLogin(codigo: string, mensagem: string, bloqueadoAte?: string): string {
  switch (codigo) {
    case 'CREDENCIAIS_INVALIDAS':
      return 'Registro ou senha incorretos.';
    case 'CONTA_BLOQUEADA':
      return bloqueadoAte ? `Muitas tentativas com senha errada. Bloqueado até ${hora(bloqueadoAte)}.` : mensagem;
    case 'PROFISSIONAL_INATIVO':
      return 'Este profissional está desativado.';
    default:
      return mensagem;
  }
}
