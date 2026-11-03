import type { FastifyInstance } from 'fastify';
import { erros } from '../erros.js';
import type { DadosDoToken, Tokens } from '../seguranca/tokens.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Rota que não exige token (só o login e a renovação, que usa o refresh token). */
    publica?: boolean;
    /** Rota restrita ao perfil ADMIN. */
    somenteAdmin?: boolean;
  }
  interface FastifyRequest {
    profissional: DadosDoToken | null;
  }
}

/**
 * Exige um token de acesso válido em toda rota (D-19). Precisa ser registrado depois do
 * log de acesso, para o log medir também o tempo da autenticação.
 */
export function registrarAutenticacao(app: FastifyInstance, tokens: Tokens): void {
  app.decorateRequest('profissional', null);

  app.addHook('onRequest', async (req) => {
    const config = req.routeOptions.config;
    if (config?.publica) return;

    const autorizacao = req.headers.authorization;
    const encontrado = autorizacao?.match(/^Bearer\s+(\S+)$/i);
    if (!encontrado?.[1]) throw erros.naoAutenticado();

    try {
      req.profissional = await tokens.verificarAcesso(encontrado[1]);
    } catch {
      throw erros.naoAutenticado();
    }
    req.profissionalIdParaLog = req.profissional.id;

    if (config?.somenteAdmin && req.profissional.perfil !== 'ADMIN') throw erros.proibido();
  });
}

/** Para usar dentro das rotas autenticadas (o gancho acima já garantiu o token). */
export function profissionalLogado(req: { profissional: DadosDoToken | null }): DadosDoToken {
  if (!req.profissional) throw erros.naoAutenticado();
  return req.profissional;
}
