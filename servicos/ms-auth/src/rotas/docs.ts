import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

/**
 * Especificação OpenAPI do ms-auth. É autenticada como todas as rotas (D-19);
 * o Portal Admin mostra o Swagger UI usando o token de quem está logado.
 */
export const rotasDocs: FastifyPluginAsyncTypebox = async (app) => {
  app.get('/api/docs/ms-auth', { schema: { hide: true } }, async () => app.swagger());
};
