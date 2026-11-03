import type { BancoLocal } from '../banco';

/** As chaves guardadas na tabela config (docs/05, seção 5.3). */
export type ChaveDeConfig =
  | 'servidor_url'
  | 'dispositivo_id'
  | 'dispositivo_nome'
  | 'conectividade'
  | 'cursor_pull'
  | 'ultima_sincronizacao_em';

export class RepositorioConfig {
  constructor(private readonly banco: BancoLocal) {}

  ler(chave: ChaveDeConfig): string | null {
    return this.banco.um<{ valor: string | null }>('SELECT valor FROM config WHERE chave = :chave', { chave })?.valor ?? null;
  }

  gravar(chave: ChaveDeConfig, valor: string | null): void {
    this.banco.executar(
      'INSERT INTO config (chave, valor) VALUES (:chave, :valor) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor',
      { chave, valor },
    );
  }
}
