import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarAmbiente, type Ambiente } from './ambiente.js';

let amb: Ambiente;

beforeAll(async () => {
  amb = await criarAmbiente();
});

afterAll(async () => {
  await amb?.encerrar();
});

describe('rotas gerais', () => {
  it('a especificação OpenAPI exige token e lista as rotas do serviço', async () => {
    expect((await amb.app.inject({ method: 'GET', url: '/api/docs/ms-auth' })).statusCode).toBe(401);

    const { tokenDeAcesso } = await amb.sessaoDe(await amb.criarProfissional());
    const resposta = await amb.app.inject({
      method: 'GET',
      url: '/api/docs/ms-auth',
      headers: { authorization: `Bearer ${tokenDeAcesso}` },
    });
    expect(resposta.statusCode).toBe(200);
    const especificacao = resposta.json();
    expect(especificacao.openapi).toBe('3.1.0');
    expect(Object.keys(especificacao.paths)).toEqual(
      expect.arrayContaining([
        '/api/auth/login',
        '/api/auth/refresh',
        '/api/auth/logout',
        '/api/auth/me',
        '/api/profissional',
        '/api/log',
        '/api/log/acesso',
        '/api/log/cliente',
      ]),
    );
    expect(especificacao.paths['/api/docs/ms-auth']).toBeUndefined();
    expect(especificacao.paths['/api/auth/login'].post.security).toEqual([]);
  });

  it('rota inexistente: 401 sem token e 404 com token', async () => {
    expect((await amb.app.inject({ method: 'GET', url: '/api/auth/nao-existe' })).statusCode).toBe(401);

    const { tokenDeAcesso } = await amb.sessaoDe(await amb.criarProfissional());
    const resposta = await amb.app.inject({
      method: 'GET',
      url: '/api/auth/nao-existe',
      headers: { authorization: `Bearer ${tokenDeAcesso}` },
    });
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({ erro: 'NAO_ENCONTRADO', mensagem: 'Rota não encontrada.' });
  });
});
