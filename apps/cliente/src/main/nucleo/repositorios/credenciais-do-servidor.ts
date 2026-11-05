import type { Perfil, TipoRegistro } from '@compartilhado/tipos';
import type { BancoLocal } from '../banco';
import { registroNormalizado } from './credenciais';

/** Um profissional da réplica, com o hash da senha ainda cifrado pelo cofre do sistema. */
export interface CredencialDoServidorLocal {
  profissionalId: string;
  tipoRegistro: TipoRegistro;
  registro: string;
  nome: string;
  perfil: Perfil;
  senhaHashCifrado: Uint8Array;
  recebidoEm: string;
  tentativasFalhas: number;
  bloqueadoAte: string | null;
}

interface Linha {
  profissional_id: string;
  tipo_registro: string;
  registro: string;
  nome: string;
  perfil: string;
  senha_hash_cifrado: Uint8Array;
  recebido_em: string;
  tentativas_falhas: number;
  bloqueado_ate: string | null;
}

const paraCredencial = (l: Linha): CredencialDoServidorLocal => ({
  profissionalId: l.profissional_id,
  tipoRegistro: l.tipo_registro as TipoRegistro,
  registro: l.registro,
  nome: l.nome,
  perfil: l.perfil === 'ADMIN' ? 'ADMIN' : 'OPERACIONAL',
  senhaHashCifrado: l.senha_hash_cifrado,
  recebidoEm: l.recebido_em,
  tentativasFalhas: l.tentativas_falhas,
  bloqueadoAte: l.bloqueado_ate,
});

/**
 * Réplica das credenciais do servidor (D-51): os profissionais ativos, recebidos a cada sincronização completa.
 * É o que deixa entrar offline quem nunca entrou online neste aparelho.
 */
export class RepositorioCredenciaisDoServidor {
  constructor(private readonly banco: BancoLocal) {}

  buscar(tipoRegistro: TipoRegistro, registro: string): CredencialDoServidorLocal | null {
    const linha = this.banco.um<Linha>('SELECT * FROM credencial_servidor WHERE tipo_registro = :tipo AND registro = :registro', {
      tipo: tipoRegistro,
      registro: registroNormalizado(registro),
    });
    return linha ? paraCredencial(linha) : null;
  }

  doProfissional(profissionalId: string): CredencialDoServidorLocal | null {
    const linha = this.banco.um<Linha>('SELECT * FROM credencial_servidor WHERE profissional_id = :id', { id: profissionalId });
    return linha ? paraCredencial(linha) : null;
  }

  vazia(): boolean {
    return !this.banco.um<{ existe: number }>('SELECT 1 AS existe FROM credencial_servidor LIMIT 1');
  }

  /**
   * A lista nova substitui a anterior: quem saiu dela (desativado no servidor) sai do aparelho. As tentativas
   * erradas e o bloqueio de quem continua na lista são mantidos.
   */
  substituir(lista: Omit<CredencialDoServidorLocal, 'tentativasFalhas' | 'bloqueadoAte'>[]): void {
    this.banco.transacao(() => {
      const ids = new Set(lista.map((c) => c.profissionalId));
      for (const { profissional_id } of this.banco.todos<{ profissional_id: string }>('SELECT profissional_id FROM credencial_servidor')) {
        if (!ids.has(profissional_id)) this.apagar(profissional_id);
      }
      for (const c of lista) {
        const parametros = {
          profissional_id: c.profissionalId,
          tipo_registro: c.tipoRegistro,
          registro: registroNormalizado(c.registro),
          nome: c.nome,
          perfil: c.perfil,
          senha_hash_cifrado: c.senhaHashCifrado,
          recebido_em: c.recebidoEm,
        };
        // Mesmo registro com outro ID (cadastro refeito no servidor): fica só o da lista
        this.banco.executar(
          'DELETE FROM credencial_servidor WHERE tipo_registro = :tipo_registro AND registro = :registro AND profissional_id <> :profissional_id',
          parametros,
        );
        this.banco.executar(
          `INSERT INTO credencial_servidor
             (profissional_id, tipo_registro, registro, nome, perfil, senha_hash_cifrado, recebido_em, tentativas_falhas, bloqueado_ate)
           VALUES (:profissional_id, :tipo_registro, :registro, :nome, :perfil, :senha_hash_cifrado, :recebido_em, 0, NULL)
           ON CONFLICT (profissional_id) DO UPDATE SET
             tipo_registro = excluded.tipo_registro, registro = excluded.registro, nome = excluded.nome,
             perfil = excluded.perfil, senha_hash_cifrado = excluded.senha_hash_cifrado, recebido_em = excluded.recebido_em`,
          parametros,
        );
      }
    });
  }

  registrarFalha(profissionalId: string, tentativas: number, bloqueadoAte: string | null): void {
    this.banco.executar(
      'UPDATE credencial_servidor SET tentativas_falhas = :tentativas, bloqueado_ate = :bloqueado WHERE profissional_id = :id',
      { id: profissionalId, tentativas, bloqueado: bloqueadoAte },
    );
  }

  zerarFalhas(profissionalId: string): void {
    this.banco.executar(
      'UPDATE credencial_servidor SET tentativas_falhas = 0, bloqueado_ate = NULL WHERE profissional_id = :id',
      { id: profissionalId },
    );
  }

  apagar(profissionalId: string): void {
    this.banco.executar('DELETE FROM credencial_servidor WHERE profissional_id = :id', { id: profissionalId });
  }

  /** Sem cofre no sistema, os hashes não podem ficar no disco. */
  limpar(): void {
    this.banco.executar('DELETE FROM credencial_servidor');
  }
}
