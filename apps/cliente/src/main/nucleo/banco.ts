/**
 * O banco local: um arquivo SQLite por aparelho (docs/05, seção 5.3), aberto com o SQLite que já vem no
 * Node.js do Electron (`node:sqlite`, D-45). Só o processo principal acessa.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { MIGRACOES } from './migracoes';

export type Parametros = Record<string, SQLInputValue | boolean | undefined>;

const nomesPorSql = new Map<string, Set<string>>();

/** Os parâmetros que o SQL usa (":nome"). O node:sqlite recusa parâmetro a mais. */
function nomesDoSql(sql: string): Set<string> {
  let nomes = nomesPorSql.get(sql);
  if (!nomes) {
    nomes = new Set([...sql.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1] as string));
    nomesPorSql.set(sql, nomes);
  }
  return nomes;
}

/** Só os parâmetros usados; e o SQLite não aceita `undefined` nem booleanos: vira null e 0/1. */
function preparar(sql: string, parametros: Parametros): Record<string, SQLInputValue> {
  const usados = nomesDoSql(sql);
  const saida: Record<string, SQLInputValue> = {};
  for (const [nome, valor] of Object.entries(parametros)) {
    if (!usados.has(nome)) continue;
    if (valor === undefined) saida[nome] = null;
    else if (typeof valor === 'boolean') saida[nome] = valor ? 1 : 0;
    else saida[nome] = valor;
  }
  return saida;
}

export class BancoLocal {
  private readonly db: DatabaseSync;
  private profundidade = 0;
  private aberto = true;

  constructor(readonly caminho: string) {
    this.db = new DatabaseSync(caminho);
    // WAL: leituras não esperam gravações; busy_timeout: espera em vez de falhar se o arquivo estiver ocupado
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
    this.migrar();
  }

  todos<T>(sql: string, parametros: Parametros = {}): T[] {
    return this.db.prepare(sql).all(preparar(sql, parametros)) as T[];
  }

  um<T>(sql: string, parametros: Parametros = {}): T | undefined {
    return this.db.prepare(sql).get(preparar(sql, parametros)) as T | undefined;
  }

  executar(sql: string, parametros: Parametros = {}): { mudancas: number } {
    const resultado = this.db.prepare(sql).run(preparar(sql, parametros));
    return { mudancas: Number(resultado.changes) };
  }

  /** Ou grava tudo, ou nada (docs/07, seção 7.3). Pode ser chamada dentro de outra transação. */
  transacao<T>(trabalho: () => T): T {
    const ponto = `t${this.profundidade}`;
    this.db.exec(this.profundidade === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${ponto}`);
    this.profundidade += 1;
    try {
      const resultado = trabalho();
      this.profundidade -= 1;
      this.db.exec(this.profundidade === 0 ? 'COMMIT' : `RELEASE ${ponto}`);
      return resultado;
    } catch (erro) {
      this.profundidade -= 1;
      this.db.exec(this.profundidade === 0 ? 'ROLLBACK' : `ROLLBACK TO ${ponto}; RELEASE ${ponto}`);
      throw erro;
    }
  }

  fechar(): void {
    if (!this.aberto) return;
    this.aberto = false;
    this.db.close();
  }

  private migrar(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS migracao (versao INTEGER PRIMARY KEY, aplicada_em TEXT NOT NULL)');
    const aplicadas = new Set(this.todos<{ versao: number }>('SELECT versao FROM migracao').map((m) => m.versao));
    for (const migracao of MIGRACOES) {
      if (aplicadas.has(migracao.versao)) continue;
      this.transacao(() => {
        this.db.exec(migracao.sql);
        this.executar('INSERT INTO migracao (versao, aplicada_em) VALUES (:versao, :agora)', {
          versao: migracao.versao,
          agora: new Date().toISOString(),
        });
      });
    }
  }
}
