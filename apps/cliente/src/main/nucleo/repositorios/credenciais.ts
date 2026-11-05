import type { Perfil, TipoRegistro } from '@compartilhado/tipos';
import type { BancoLocal } from '../banco';

export interface CredencialOffline {
  profissionalId: string;
  tipoRegistro: TipoRegistro;
  registro: string;
  nome: string;
  perfil: Perfil;
  verificador: string;
  sal: string;
  validadoOnlineEm: string;
  tentativasFalhas: number;
  bloqueadoAte: string | null;
}

interface Linha {
  profissional_id: string;
  tipo_registro: string;
  registro: string;
  nome: string;
  perfil: string;
  verificador: string;
  sal: string;
  validado_online_em: string;
  tentativas_falhas: number;
  bloqueado_ate: string | null;
}

const paraCredencial = (l: Linha): CredencialOffline => ({
  profissionalId: l.profissional_id,
  tipoRegistro: l.tipo_registro as TipoRegistro,
  registro: l.registro,
  nome: l.nome,
  perfil: l.perfil === 'ADMIN' ? 'ADMIN' : 'OPERACIONAL',
  verificador: l.verificador,
  sal: l.sal,
  validadoOnlineEm: l.validado_online_em,
  tentativasFalhas: l.tentativas_falhas,
  bloqueadoAte: l.bloqueado_ate,
});

/** O registro como o servidor compara: sem espaços nas pontas e em maiúsculas. */
export const registroNormalizado = (registro: string) => registro.trim().toUpperCase();

/** Quem já entrou online neste aparelho e pode entrar offline (docs/08, seção 8.5). */
export class RepositorioCredenciais {
  constructor(private readonly banco: BancoLocal) {}

  buscar(tipoRegistro: TipoRegistro, registro: string): CredencialOffline | null {
    const linha = this.banco.um<Linha>('SELECT * FROM credencial_offline WHERE tipo_registro = :tipo AND registro = :registro', {
      tipo: tipoRegistro,
      registro: registroNormalizado(registro),
    });
    return linha ? paraCredencial(linha) : null;
  }

  doProfissional(profissionalId: string): CredencialOffline | null {
    const linha = this.banco.um<Linha>('SELECT * FROM credencial_offline WHERE profissional_id = :id', { id: profissionalId });
    return linha ? paraCredencial(linha) : null;
  }

  /** A cada login online: guarda o verificador novo e zera as tentativas. */
  salvar(credencial: Omit<CredencialOffline, 'tentativasFalhas' | 'bloqueadoAte'>): void {
    const parametros = {
      profissional_id: credencial.profissionalId,
      tipo_registro: credencial.tipoRegistro,
      registro: registroNormalizado(credencial.registro),
      nome: credencial.nome,
      perfil: credencial.perfil,
      verificador: credencial.verificador,
      sal: credencial.sal,
      validado_online_em: credencial.validadoOnlineEm,
    };
    this.banco.transacao(() => {
      // Mesmo registro com outro ID (cadastro refeito no servidor): fica só o mais novo
      this.banco.executar(
        'DELETE FROM credencial_offline WHERE tipo_registro = :tipo_registro AND registro = :registro AND profissional_id <> :profissional_id',
        parametros,
      );
      this.banco.executar(
        `INSERT INTO credencial_offline
           (profissional_id, tipo_registro, registro, nome, perfil, verificador, sal, validado_online_em, tentativas_falhas, bloqueado_ate)
         VALUES (:profissional_id, :tipo_registro, :registro, :nome, :perfil, :verificador, :sal, :validado_online_em, 0, NULL)
         ON CONFLICT (profissional_id) DO UPDATE SET
           tipo_registro = excluded.tipo_registro, registro = excluded.registro, nome = excluded.nome,
           perfil = excluded.perfil, verificador = excluded.verificador, sal = excluded.sal,
           validado_online_em = excluded.validado_online_em, tentativas_falhas = 0, bloqueado_ate = NULL`,
        parametros,
      );
    });
  }

  /** Renovação da sessão no servidor também conta como validação online. */
  validarOnline(profissionalId: string, agora: string): void {
    this.banco.executar('UPDATE credencial_offline SET validado_online_em = :agora WHERE profissional_id = :id', {
      id: profissionalId,
      agora,
    });
  }

  registrarFalha(profissionalId: string, tentativas: number, bloqueadoAte: string | null): void {
    this.banco.executar(
      'UPDATE credencial_offline SET tentativas_falhas = :tentativas, bloqueado_ate = :bloqueado WHERE profissional_id = :id',
      { id: profissionalId, tentativas, bloqueado: bloqueadoAte },
    );
  }

  zerarFalhas(profissionalId: string): void {
    this.banco.executar(
      'UPDATE credencial_offline SET tentativas_falhas = 0, bloqueado_ate = NULL WHERE profissional_id = :id',
      { id: profissionalId },
    );
  }

  idsGuardados(): string[] {
    return this.banco.todos<{ profissional_id: string }>('SELECT profissional_id FROM credencial_offline').map((l) => l.profissional_id);
  }

  /** Profissional desativado no servidor: não entra mais offline neste aparelho. */
  apagar(profissionalId: string): void {
    this.banco.executar('DELETE FROM credencial_offline WHERE profissional_id = :id', { id: profissionalId });
  }
}
