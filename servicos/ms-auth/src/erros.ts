import type { FastifyError, FastifyInstance } from 'fastify';

/** Erro de negócio com o formato padrão da API (docs/06-api.md, seção 6.5). */
export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly extras: Record<string, unknown> = {},
  ) {
    super(mensagem);
  }
}

export const erros = {
  naoAutenticado: () =>
    new ErroApi(401, 'NAO_AUTENTICADO', 'Token ausente, inválido ou vencido. Faça login novamente.'),
  credenciaisInvalidas: () => new ErroApi(401, 'CREDENCIAIS_INVALIDAS', 'Registro ou senha incorretos.'),
  sessaoInvalida: () => new ErroApi(401, 'SESSAO_INVALIDA', 'Sessão vencida ou encerrada. Faça login novamente.'),
  proibido: () => new ErroApi(403, 'PROIBIDO', 'Esta rota é restrita a administradores.'),
  profissionalInativo: () => new ErroApi(403, 'PROFISSIONAL_INATIVO', 'Este profissional está desativado.'),
  contaBloqueada: (ate: Date) =>
    new ErroApi(423, 'CONTA_BLOQUEADA', 'Muitas tentativas com senha errada. Tente de novo mais tarde.', {
      bloqueadoAte: ate.toISOString(),
    }),
};

type Parametros = Record<string, unknown>;

const MENSAGENS_VALIDACAO: Record<string, (p: Parametros) => string> = {
  required: () => 'campo obrigatório',
  format: (p) => `formato inválido (esperado: ${String(p.format)})`,
  type: (p) => `tipo inválido (esperado: ${String(p.type)})`,
  enum: (p) => `valor não permitido (use: ${((p.allowedValues as unknown[]) ?? []).join(', ')})`,
  const: () => 'valor não permitido',
  anyOf: () => 'valor não permitido',
  minLength: (p) => `muito curto (mínimo ${String(p.limit)} caracteres)`,
  maxLength: (p) => `muito longo (máximo ${String(p.limit)} caracteres)`,
  minItems: (p) => `itens de menos (mínimo ${String(p.limit)})`,
  maxItems: (p) => `itens demais (máximo ${String(p.limit)})`,
  minimum: (p) => `menor que o mínimo permitido (${String(p.limit)})`,
  maximum: (p) => `maior que o máximo permitido (${String(p.limit)})`,
  pattern: () => 'formato inválido',
  additionalProperties: (p) => `campo não permitido (${String(p.additionalProperty)})`,
};

function nomeDoCampo(instancePath: string | undefined, params: Parametros, contexto?: string): string {
  const caminho = (instancePath ?? '').replace(/^\//, '').replace(/\//g, '.');
  const faltando = typeof params.missingProperty === 'string' ? params.missingProperty : '';
  return [caminho, faltando].filter(Boolean).join('.') || contexto || 'corpo';
}

export function registrarTratamentoDeErros(app: FastifyInstance): void {
  app.setNotFoundHandler((_req, reply) => {
    void reply.code(404).send({ erro: 'NAO_ENCONTRADO', mensagem: 'Rota não encontrada.' });
  });

  app.setErrorHandler((erro: FastifyError | ErroApi, req, reply) => {
    if (erro instanceof ErroApi) {
      return reply.code(erro.status).send({ erro: erro.codigo, mensagem: erro.message, ...erro.extras });
    }
    if (erro.validation) {
      const detalhes = erro.validation.map((v) => {
        const params = (v.params ?? {}) as Parametros;
        const mensagem = MENSAGENS_VALIDACAO[v.keyword]?.(params) ?? v.message ?? 'valor inválido';
        return { campo: nomeDoCampo(v.instancePath, params, erro.validationContext), mensagem };
      });
      return reply.code(400).send({ erro: 'VALIDACAO', mensagem: 'Há campos inválidos.', detalhes });
    }
    const status = erro.statusCode ?? 500;
    if (status === 404) {
      return reply.code(404).send({ erro: 'NAO_ENCONTRADO', mensagem: 'Recurso não encontrado.' });
    }
    if (status >= 400 && status < 500) {
      const mensagem =
        status === 413 ? 'O corpo da requisição é grande demais.' : 'Requisição inválida (confira o JSON enviado).';
      return reply.code(400).send({ erro: 'VALIDACAO', mensagem });
    }
    req.log.error({ err: erro }, 'erro inesperado');
    return reply.code(500).send({ erro: 'ERRO_INTERNO', mensagem: 'Erro inesperado no servidor.' });
  });
}
