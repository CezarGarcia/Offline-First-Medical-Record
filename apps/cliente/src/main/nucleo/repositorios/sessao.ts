import type { Modo } from '@compartilhado/tipos';
import type { BancoLocal } from '../banco';

export interface SessaoGuardada {
  profissionalId: string;
  modoLogin: Modo;
  iniciadaEm: string;
  expiraEm: string;
  /** Criptografado pelo cofre do sistema (safeStorage); vazio numa sessão iniciada offline. */
  refreshTokenCifrado: Uint8Array | null;
  sessaoServidorExpiraEm: string | null;
}

interface Linha {
  profissional_id: string;
  modo_login: string;
  iniciada_em: string;
  expira_em: string;
  refresh_token_cifrado: Uint8Array | null;
  sessao_servidor_expira_em: string | null;
}

/** A sessão mantida entre aberturas do app (docs/08, seção 8.6). O token de acesso nunca vai para o disco. */
export class RepositorioSessao {
  constructor(private readonly banco: BancoLocal) {}

  ler(): SessaoGuardada | null {
    const linha = this.banco.um<Linha>('SELECT * FROM sessao WHERE id = 1');
    if (!linha) return null;
    return {
      profissionalId: linha.profissional_id,
      modoLogin: linha.modo_login === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
      iniciadaEm: linha.iniciada_em,
      expiraEm: linha.expira_em,
      refreshTokenCifrado: linha.refresh_token_cifrado,
      sessaoServidorExpiraEm: linha.sessao_servidor_expira_em,
    };
  }

  gravar(sessao: SessaoGuardada): void {
    this.banco.executar(
      `INSERT INTO sessao (id, profissional_id, modo_login, iniciada_em, expira_em, refresh_token_cifrado, sessao_servidor_expira_em)
       VALUES (1, :profissional_id, :modo_login, :iniciada_em, :expira_em, :refresh, :servidor)
       ON CONFLICT (id) DO UPDATE SET
         profissional_id = excluded.profissional_id, modo_login = excluded.modo_login, iniciada_em = excluded.iniciada_em,
         expira_em = excluded.expira_em, refresh_token_cifrado = excluded.refresh_token_cifrado,
         sessao_servidor_expira_em = excluded.sessao_servidor_expira_em`,
      {
        profissional_id: sessao.profissionalId,
        modo_login: sessao.modoLogin,
        iniciada_em: sessao.iniciadaEm,
        expira_em: sessao.expiraEm,
        refresh: sessao.refreshTokenCifrado,
        servidor: sessao.sessaoServidorExpiraEm,
      },
    );
  }

  apagar(): void {
    this.banco.executar('DELETE FROM sessao');
  }
}
