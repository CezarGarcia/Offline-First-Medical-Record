import { Type, type TSchema } from 'typebox';

/** Texto restrito a uma lista de valores (aparece como "enum" no OpenAPI). */
export const enumeracao = <const T extends readonly string[]>(valores: T, opcoes: Record<string, unknown> = {}) =>
  Type.Unsafe<T[number]>({ type: 'string', enum: [...valores], ...opcoes });

export const Nulavel = <T extends TSchema>(esquema: T) => Type.Union([esquema, Type.Null()]);

export const Uuid = Type.String({ format: 'uuid' });
export const DataHora = Type.String({ format: 'date-time' });

export const TIPOS_REGISTRO = ['CRM', 'COREN', 'SOCORRISTA'] as const;
export const PERFIS = ['ADMIN', 'OPERACIONAL'] as const;
export const MODOS = ['ONLINE', 'OFFLINE'] as const;

export const TipoRegistro = enumeracao(TIPOS_REGISTRO);
export const Perfil = enumeracao(PERFIS);
export const Modo = enumeracao(MODOS);

export type PerfilProfissional = (typeof PERFIS)[number];
export type TipoRegistroProfissional = (typeof TIPOS_REGISTRO)[number];

export const ProfissionalResumo = Type.Object({
  id: Uuid,
  nome: Type.String(),
  tipoRegistro: TipoRegistro,
  registro: Type.String(),
  perfil: Perfil,
});

/** Paginação usada nas listagens de log. */
export const Paginacao = {
  pagina: Type.Integer({ minimum: 1, default: 1 }),
  tamanho: Type.Integer({ minimum: 1, maximum: 200, default: 50 }),
};
