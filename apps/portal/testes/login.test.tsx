import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { armazemDaSessao } from '../src/api/sessao';
import { ACESSO_RESTRITO } from '../src/paginas/Login';
import { ApiFalsa, ATENDIMENTO, erro, json, renderizarPortal, respostaDeLogin, resumo } from './ambiente';

async function preencher(registro: string, senha: string, tipo?: string) {
  const usuario = userEvent.setup();
  if (tipo) await usuario.click(screen.getByText(tipo));
  if (registro) await usuario.type(screen.getByRole('textbox', { name: /^Registro/ }), registro);
  await usuario.type(screen.getByLabelText(/^Senha/), senha);
  await usuario.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('Login do portal', () => {
  it('sem sessão, qualquer página leva ao login', async () => {
    new ApiFalsa().instalar();
    renderizarPortal('/logs/acesso');
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('administrador entra e vê os atendimentos', async () => {
    const api = new ApiFalsa()
      .em('POST /api/auth/login', json(200, respostaDeLogin('ADMIN')))
      .em('GET /api/atendimento', json(200, [resumo(ATENDIMENTO)]))
      .instalar();
    renderizarPortal('/login');
    await preencher('10001-RS', 'senha-certa');

    expect(await screen.findByText('João da Silva')).toBeInTheDocument();
    expect(api.chamadasPara('POST', '/api/auth/login')[0]?.corpo).toEqual({
      tipoRegistro: 'CRM',
      registro: '10001-RS',
      senha: 'senha-certa',
    });
    expect(armazemDaSessao.atual()?.profissional.perfil).toBe('ADMIN');
  });

  it('perfil operacional é recusado e a sessão criada no servidor é encerrada', async () => {
    const api = new ApiFalsa()
      .em('POST /api/auth/login', json(200, respostaDeLogin('OPERACIONAL')))
      .em('POST /api/auth/logout', json(204, null))
      .instalar();
    renderizarPortal('/login');
    await preencher('543210-RS', 'senha-certa', 'COREN');

    expect(await screen.findByRole('alert')).toHaveTextContent(ACESSO_RESTRITO);
    expect(api.chamadasPara('POST', '/api/auth/login')[0]?.corpo).toMatchObject({ tipoRegistro: 'COREN' });
    await waitFor(() => expect(api.chamadasPara('POST', '/api/auth/logout')).toHaveLength(1));
    expect(api.chamadasPara('POST', '/api/auth/logout')[0]?.cabecalhos.authorization).toBe('Bearer token-operacional');
    expect(armazemDaSessao.atual()).toBeNull();
  });

  it('explica senha errada e conta bloqueada', async () => {
    const api = new ApiFalsa().em('POST /api/auth/login', erro(401, 'CREDENCIAIS_INVALIDAS')).instalar();
    renderizarPortal('/login');
    await preencher('10001-RS', 'errada');
    expect(await screen.findByRole('alert')).toHaveTextContent('Registro ou senha incorretos.');

    api.em(
      'POST /api/auth/login',
      erro(423, 'CONTA_BLOQUEADA', 'bloqueada', { bloqueadoAte: '2026-11-03T13:05:00Z' }),
    );
    await preencher('', 'errada');
    // 13:05 UTC = 10:05 em Brasília
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('bloqueada até 10:05'));
  });
});
