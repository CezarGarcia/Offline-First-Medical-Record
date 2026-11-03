import { uuid7 } from '@compartilhado/ids';
import type { EstadoConectividade } from './conectividade';
import type { RepositorioLogs } from './repositorios/logs';

export type AcaoDoCliente =
  | 'LOGIN_ONLINE'
  | 'LOGIN_OFFLINE'
  | 'LOGIN_FALHOU'
  | 'LOGOUT'
  | 'CONECTIVIDADE_ALTERADA'
  | 'PESSOA_CRIADA'
  | 'PRONTUARIO_CRIADO'
  | 'ATENDIMENTO_CRIADO'
  | 'EMAIL_SOLICITADO'
  | 'PDF_BAIXADO'
  | 'SINCRONIZACAO_INICIADA'
  | 'SINCRONIZACAO_CONCLUIDA'
  | 'SINCRONIZACAO_FALHOU'
  | 'REGISTRO_UNIFICADO'
  | 'ITEM_COM_ERRO';

/** Registra as ações do aparelho no log local (docs/08, seção 8.10), com a hora e a posição da chave. */
export class Auditoria {
  constructor(
    private readonly logs: RepositorioLogs,
    private readonly conectividade: EstadoConectividade,
    private readonly profissionalAtual: () => string | null,
    private readonly agora: () => Date,
  ) {}

  registrar(acao: AcaoDoCliente, detalhes: Record<string, unknown> | null = null, profissionalId?: string | null): void {
    this.logs.registrar({
      id: uuid7(),
      profissionalId: profissionalId === undefined ? this.profissionalAtual() : profissionalId,
      dataHora: this.agora().toISOString(),
      acao,
      modo: this.conectividade.atual,
      detalhes,
    });
  }
}
