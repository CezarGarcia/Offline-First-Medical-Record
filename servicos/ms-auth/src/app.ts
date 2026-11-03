import swagger from '@fastify/swagger';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type pg from 'pg';
import { registrarTratamentoDeErros } from './erros.js';
import { registrarAutenticacao } from './plugins/autenticacao.js';
import { registrarLogDeAcesso } from './plugins/logAcesso.js';
import { RepositorioLogs } from './repositorios/logs.js';
import { RepositorioProfissionais } from './repositorios/profissionais.js';
import { RepositorioSessoes } from './repositorios/sessoes.js';
import { rotasAuth } from './rotas/auth.js';
import { rotasDocs } from './rotas/docs.js';
import { rotasLogs } from './rotas/logs.js';
import { rotasProfissionais } from './rotas/profissionais.js';
import type { Tokens } from './seguranca/tokens.js';

export interface Dependencias {
  pool: pg.Pool;
  tokens: Tokens;
}

export async function construirApp(dep: Dependencias, opcoes: { logger?: FastifyServerOptions['logger'] } = {}) {
  const base = Fastify({
    logger: opcoes.logger ?? true,
    bodyLimit: 5 * 1024 * 1024,
    // O IP de quem chamou vem do X-Real-IP, preenchido pelo Nginx (ver plugins/logAcesso.ts)
    trustProxy: false,
  });

  registrarTratamentoDeErros(base);
  // Ordem importa: o log de acesso começa a medir antes da autenticação
  registrarLogDeAcesso(base, new RepositorioLogs(dep.pool));
  registrarAutenticacao(base, dep.tokens);

  const app = base.withTypeProvider<TypeBoxTypeProvider>();

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'MedicalField — ms-auth',
        description: 'Autenticação, profissionais e auditoria. Contrato completo em docs/06-api.md.',
        version: '1.0.0',
      },
      components: {
        securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
      security: [{ bearer: [] }],
    },
  });

  const profissionais = new RepositorioProfissionais(dep.pool);
  await app.register(rotasAuth, { profissionais, sessoes: new RepositorioSessoes(dep.pool), tokens: dep.tokens });
  await app.register(rotasProfissionais, { profissionais });
  await app.register(rotasLogs, { logs: new RepositorioLogs(dep.pool) });
  await app.register(rotasDocs);

  return app;
}
