import type { ItemDaFila, StatusItemDaFila, TipoItemDaFila } from '../../../comum/contrato';
import type { BancoLocal } from '../banco';

export interface LinhaDaFila {
  ordem: number;
  id: string;
  tipo: TipoItemDaFila;
  entidade_id: string;
  payload: string;
  status: StatusItemDaFila;
  tentativas: number;
  ultimo_erro: string | null;
  proxima_tentativa_em: string | null;
  resultado: string | null;
  criado_por_id: string;
  criado_em: string;
  concluido_em: string | null;
}

export interface NovoItem {
  id: string;
  tipo: TipoItemDaFila;
  entidadeId: string;
  payload: unknown;
  criadoPorId: string;
  criadoEm: string;
}

/** A fila de pendentes (padrão Outbox, docs/05 e docs/07). A ordem de criação é a ordem de envio. */
export class RepositorioOutbox {
  constructor(private readonly banco: BancoLocal) {}

  adicionar(item: NovoItem): void {
    this.banco.executar(
      `INSERT INTO outbox (id, tipo, entidade_id, payload, status, tentativas, criado_por_id, criado_em)
       VALUES (:id, :tipo, :entidade_id, :payload, 'PENDENTE', 0, :criado_por_id, :criado_em)`,
      {
        id: item.id,
        tipo: item.tipo,
        entidade_id: item.entidadeId,
        payload: JSON.stringify(item.payload),
        criado_por_id: item.criadoPorId,
        criado_em: item.criadoEm,
      },
    );
  }

  /** Os itens que ainda vão sair, na ordem. */
  pendentes(): LinhaDaFila[] {
    return this.banco.todos<LinhaDaFila>("SELECT * FROM outbox WHERE status = 'PENDENTE' ORDER BY ordem");
  }

  buscar(id: string): LinhaDaFila | null {
    return this.banco.um<LinhaDaFila>('SELECT * FROM outbox WHERE id = :id', { id }) ?? null;
  }

  doTipo(tipo: TipoItemDaFila, entidadeId?: string): LinhaDaFila[] {
    return entidadeId
      ? this.banco.todos<LinhaDaFila>('SELECT * FROM outbox WHERE tipo = :tipo AND entidade_id = :entidadeId ORDER BY ordem', {
          tipo,
          entidadeId,
        })
      : this.banco.todos<LinhaDaFila>('SELECT * FROM outbox WHERE tipo = :tipo ORDER BY ordem', { tipo });
  }

  marcarEnviando(id: string): void {
    this.banco.executar("UPDATE outbox SET status = 'ENVIANDO' WHERE id = :id", { id });
  }

  concluir(id: string, agora: string, resultado: unknown = null): void {
    this.banco.executar(
      `UPDATE outbox SET status = 'CONCLUIDO', concluido_em = :agora, ultimo_erro = NULL, proxima_tentativa_em = NULL,
              tentativas = tentativas + 1, resultado = :resultado
       WHERE id = :id`,
      { id, agora, resultado: resultado === null ? null : JSON.stringify(resultado) },
    );
  }

  /** Erro definitivo: o item para, com o motivo, e os outros seguem (docs/07, seção 7.4). */
  falhar(id: string, erro: string): void {
    this.banco.executar(
      "UPDATE outbox SET status = 'ERRO', ultimo_erro = :erro, tentativas = tentativas + 1, proxima_tentativa_em = NULL WHERE id = :id",
      { id, erro },
    );
  }

  /** Erro temporário: volta para a fila com uma nova tentativa marcada. */
  adiar(id: string, erro: string, proximaTentativaEm: string): void {
    this.banco.executar(
      `UPDATE outbox SET status = 'PENDENTE', ultimo_erro = :erro, tentativas = tentativas + 1,
              proxima_tentativa_em = :proxima
       WHERE id = :id`,
      { id, erro, proxima: proximaTentativaEm },
    );
  }

  /** A chave foi para Offline no meio do envio: volta como estava, sem contar tentativa. */
  devolver(id: string): void {
    this.banco.executar("UPDATE outbox SET status = 'PENDENTE' WHERE id = :id AND status = 'ENVIANDO'", { id });
  }

  /** O app fechou no meio de um envio: na abertura, o que estava "enviando" volta para a fila. */
  devolverOsQueEstavamEnviando(): void {
    this.banco.executar("UPDATE outbox SET status = 'PENDENTE' WHERE status = 'ENVIANDO'");
  }

  /** Botão "Tentar de novo" da tela da fila: volta para PENDENTE e zera as tentativas. */
  tentarDeNovo(id: string): boolean {
    return (
      this.banco.executar(
        "UPDATE outbox SET status = 'PENDENTE', tentativas = 0, proxima_tentativa_em = NULL WHERE id = :id AND status = 'ERRO'",
        { id },
      ).mudancas > 0
    );
  }

  contar(status: StatusItemDaFila | StatusItemDaFila[]): number {
    const lista = Array.isArray(status) ? status : [status];
    const marcadores = lista.map((_, i) => `:s${i}`).join(', ');
    const parametros = Object.fromEntries(lista.map((s, i) => [`s${i}`, s]));
    return this.banco.um<{ total: number }>(`SELECT COUNT(*) AS total FROM outbox WHERE status IN (${marcadores})`, parametros)
      ?.total ?? 0;
  }

  /** Quando é a próxima tentativa marcada (para agendar o envio). */
  proximaTentativa(): string | null {
    return (
      this.banco.um<{ proxima: string | null }>(
        "SELECT MIN(proxima_tentativa_em) AS proxima FROM outbox WHERE status = 'PENDENTE' AND proxima_tentativa_em IS NOT NULL",
      )?.proxima ?? null
    );
  }

  listar(descrever: (linha: LinhaDaFila) => string, limite = 300): ItemDaFila[] {
    return this.banco
      .todos<LinhaDaFila>('SELECT * FROM outbox ORDER BY ordem DESC LIMIT :limite', { limite })
      .map((l) => ({
        ordem: l.ordem,
        id: l.id,
        tipo: l.tipo,
        entidadeId: l.entidade_id,
        descricao: descrever(l),
        status: l.status,
        tentativas: l.tentativas,
        ultimoErro: l.ultimo_erro,
        proximaTentativaEm: l.proxima_tentativa_em,
        criadoEm: l.criado_em,
        concluidoEm: l.concluido_em,
      }));
  }
}
