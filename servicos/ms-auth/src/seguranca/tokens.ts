import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, importPKCS8, importSPKI, jwtVerify } from 'jose';
import { EMISSOR_TOKEN, PUBLICO_TOKEN, VALIDADE_TOKEN_ACESSO_MIN } from '../config.js';
import { TIPOS_REGISTRO, type PerfilProfissional, type TipoRegistroProfissional } from '../esquemas.js';

type Chave = Awaited<ReturnType<typeof importSPKI>>;

export interface ProfissionalDoToken {
  id: string;
  nome: string;
  tipoRegistro: TipoRegistroProfissional;
  registro: string;
  perfil: PerfilProfissional;
}

export interface DadosDoToken extends ProfissionalDoToken {
  sessaoId: string;
}

/**
 * Emite e confere os tokens de acesso (JWT RS256).
 * O ms-auth é o único que tem a chave privada; os outros serviços só conferem com a pública.
 */
export class Tokens {
  private constructor(
    private readonly privada: Chave,
    private readonly publica: Chave,
  ) {}

  static async dePem(privadaPem: string, publicaPem: string): Promise<Tokens> {
    return new Tokens(await importPKCS8(privadaPem, 'RS256'), await importSPKI(publicaPem, 'RS256'));
  }

  /** O token vale 15 minutos, mas nunca passa do fim da sessão. */
  async emitirAcesso(
    profissional: ProfissionalDoToken,
    sessaoId: string,
    sessaoExpiraEm: Date,
  ): Promise<{ token: string; expiraEm: Date }> {
    const limite = Math.min(Date.now() + VALIDADE_TOKEN_ACESSO_MIN * 60_000, sessaoExpiraEm.getTime());
    const expiraEmSegundos = Math.floor(limite / 1000);
    const token = await new SignJWT({
      sid: sessaoId,
      nome: profissional.nome,
      tipoRegistro: profissional.tipoRegistro,
      registro: profissional.registro,
      perfil: profissional.perfil,
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(EMISSOR_TOKEN)
      .setAudience(PUBLICO_TOKEN)
      .setSubject(profissional.id)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(expiraEmSegundos)
      .sign(this.privada);
    return { token, expiraEm: new Date(expiraEmSegundos * 1000) };
  }

  /** Lança erro se o token for inválido, de outro emissor, de outra chave ou vencido. */
  async verificarAcesso(token: string): Promise<DadosDoToken> {
    const { payload } = await jwtVerify(token, this.publica, {
      issuer: EMISSOR_TOKEN,
      audience: PUBLICO_TOKEN,
      algorithms: ['RS256'],
    });
    const tipoRegistro = TIPOS_REGISTRO.find((tipo) => tipo === payload.tipoRegistro);
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || !tipoRegistro) {
      throw new Error('Token sem os dados esperados do profissional ou da sessão.');
    }
    return {
      id: payload.sub,
      sessaoId: payload.sid,
      nome: String(payload.nome ?? ''),
      tipoRegistro,
      registro: String(payload.registro ?? ''),
      // Na dúvida, o menor privilégio
      perfil: payload.perfil === 'ADMIN' ? 'ADMIN' : 'OPERACIONAL',
    };
  }
}

/** Refresh token: 32 bytes aleatórios, sem significado. O banco guarda só o hash. */
export const novoRefreshToken = (): string => randomBytes(32).toString('base64url');

export const hashDoRefreshToken = (token: string): string => createHash('sha256').update(token).digest('hex');
