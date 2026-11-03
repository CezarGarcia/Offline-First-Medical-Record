import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarAmbiente, type Ambiente } from './ambiente.js';

let amb: Ambiente;

beforeAll(async () => {
  amb = await criarAmbiente();
});

afterAll(async () => {
  await amb?.encerrar();
});

const comToken = (token: string, extras: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, ...extras });

describe('middleware de log de acesso', () => {
  it('grava toda requisição com data/hora, IP real, profissional, método, rota, status e tempo', async () => {
    const p = await amb.criarProfissional();
    const agente = `teste-auditoria/${randomUUID()}`;
    const dispositivo = randomUUID();
    const headers = { 'user-agent': agente, 'x-real-ip': '203.0.113.7', 'x-dispositivo-id': dispositivo };

    const login = await amb.login(p, {}, headers);
    const token = login.json().tokenDeAcesso as string;
    await amb.app.inject({ method: 'GET', url: '/api/auth/me', headers });
    await amb.app.inject({ method: 'GET', url: '/api/auth/me?algo=1', headers: comToken(token, headers) });
    await amb.app.aguardarLogsPendentes();

    const { rows } = await amb.pool.query(
      `SELECT servico, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms, dispositivo_id, data_hora
         FROM auditoria.log_acesso WHERE user_agent = $1 ORDER BY data_hora`,
      [agente],
    );
    expect(rows).toHaveLength(3);
    const [doLogin, semToken, comTokenValido] = rows;
    expect(doLogin).toMatchObject({
      servico: 'ms-auth',
      ip_cliente: '203.0.113.7',
      profissional_id: p.id,
      metodo: 'POST',
      rota: '/api/auth/login',
      status_code: 200,
      dispositivo_id: dispositivo,
    });
    expect(semToken).toMatchObject({ profissional_id: null, rota: '/api/auth/me', status_code: 401 });
    expect(comTokenValido).toMatchObject({ profissional_id: p.id, rota: '/api/auth/me', status_code: 200 });
    for (const linha of rows) {
      expect(linha.tempo_ms).toBeGreaterThanOrEqual(0);
      expect(linha.data_hora).toBeInstanceOf(Date);
    }
  });

  it('ignora um X-Dispositivo-Id que não é UUID', async () => {
    const agente = `teste-auditoria/${randomUUID()}`;
    await amb.app.inject({ method: 'GET', url: '/api/auth/me', headers: { 'user-agent': agente, 'x-dispositivo-id': 'nao-e-uuid' } });
    await amb.app.aguardarLogsPendentes();
    const { rows } = await amb.pool.query('SELECT dispositivo_id FROM auditoria.log_acesso WHERE user_agent = $1', [agente]);
    expect(rows).toEqual([{ dispositivo_id: null }]);
  });

  it('os logs não podem ser alterados nem apagados, nem pelo dono das tabelas', async () => {
    for (const comando of [
      'UPDATE auditoria.log_acesso SET status_code = 200',
      'DELETE FROM auditoria.log_acesso',
      'TRUNCATE auditoria.log_acesso',
      'UPDATE auditoria.log_cliente SET acao = $$X$$',
      'TRUNCATE auditoria.log_cliente',
    ]) {
      await expect(amb.pool.query(comando)).rejects.toThrow(/não podem ser alterados nem apagados/);
    }
  });

  const senhaDoMsClinico = process.env.MS_CLINICO_DB_SENHA;
  it.skipIf(!senhaDoMsClinico)('ms-clinico consegue só INSERIR no log de acesso', async () => {
    const outro = new pg.Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORTA ?? 5432),
      database: process.env.DB_NOME ?? 'medicalfield',
      user: 'ms_clinico',
      password: senhaDoMsClinico,
    });
    await outro.connect();
    try {
      await outro.query(
        `INSERT INTO auditoria.log_acesso (servico, ip_cliente, metodo, rota, status_code, tempo_ms)
         VALUES ('ms-clinico', '127.0.0.1', 'GET', '/api/teste-permissao', 200, 1)`,
      );
      await expect(outro.query('SELECT * FROM auditoria.log_acesso LIMIT 1')).rejects.toThrow(/permission denied/);
      await expect(outro.query('SELECT * FROM auth.profissional LIMIT 1')).rejects.toThrow(/permission denied/);
    } finally {
      await outro.end();
    }
  });
});

describe('rotas de administrador', () => {
  it('GET /api/profissional: operacional recebe 403; admin recebe a lista, sem senha', async () => {
    const operacional = await amb.criarProfissional();
    const admin = await amb.criarProfissional({ perfil: 'ADMIN' });

    const negado = await amb.app.inject({
      method: 'GET',
      url: '/api/profissional',
      headers: comToken((await amb.sessaoDe(operacional)).tokenDeAcesso),
    });
    expect(negado.statusCode).toBe(403);
    expect(negado.json().erro).toBe('PROIBIDO');

    const lista = await amb.app.inject({
      method: 'GET',
      url: '/api/profissional',
      headers: comToken((await amb.sessaoDe(admin)).tokenDeAcesso),
    });
    expect(lista.statusCode).toBe(200);
    const itens = lista.json() as Array<Record<string, unknown>>;
    expect(itens.map((i) => i.id)).toEqual(expect.arrayContaining([operacional.id, admin.id]));
    expect(Object.keys(itens[0]!).sort()).toEqual(['ativo', 'criadoEm', 'id', 'nome', 'perfil', 'registro', 'tipoRegistro']);
  });
});

describe('POST /api/log e consultas de log', () => {
  const logDoCliente = (dispositivoId: string, extras: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    dispositivoId,
    dispositivoNome: 'Ambulância Teste',
    dataHora: new Date().toISOString(),
    acao: 'ATENDIMENTO_CRIADO',
    modo: 'OFFLINE',
    detalhes: { atendimentoId: randomUUID() },
    ...extras,
  });

  it('recebe o lote, ignora IDs repetidos e grava quem enviou', async () => {
    const p = await amb.criarProfissional();
    const { tokenDeAcesso } = await amb.sessaoDe(p);
    const dispositivo = randomUUID();
    const logs = [logDoCliente(dispositivo, { profissionalId: p.id }), logDoCliente(dispositivo, { acao: 'LOGIN_OFFLINE' })];

    const enviar = (corpo: unknown) =>
      amb.app.inject({ method: 'POST', url: '/api/log', headers: comToken(tokenDeAcesso), payload: corpo });

    const primeira = await enviar({ logs });
    expect(primeira.json()).toEqual({ recebidos: 2, novos: 2, repetidos: 0 });
    const repetida = await enviar({ logs: [...logs, logDoCliente(dispositivo)] });
    expect(repetida.json()).toEqual({ recebidos: 3, novos: 1, repetidos: 2 });

    const { rows } = await amb.pool.query(
      'SELECT acao, modo, enviado_por_id, dispositivo_nome, detalhes FROM auditoria.log_cliente WHERE dispositivo_id = $1',
      [dispositivo],
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.enviado_por_id === p.id && r.modo === 'OFFLINE')).toBe(true);
    expect(rows[0].detalhes).toHaveProperty('atendimentoId');
  });

  it('recusa lote com mais de 500 logs e ação fora do padrão', async () => {
    const { tokenDeAcesso } = await amb.sessaoDe(await amb.criarProfissional());
    const dispositivo = randomUUID();
    const grande = await amb.app.inject({
      method: 'POST',
      url: '/api/log',
      headers: comToken(tokenDeAcesso),
      payload: { logs: Array.from({ length: 501 }, () => logDoCliente(dispositivo)) },
    });
    expect(grande.statusCode).toBe(400);
    expect(grande.json().detalhes[0].mensagem).toContain('máximo 500');

    const acaoRuim = await amb.app.inject({
      method: 'POST',
      url: '/api/log',
      headers: comToken(tokenDeAcesso),
      payload: { logs: [logDoCliente(dispositivo, { acao: 'minusculas' })] },
    });
    expect(acaoRuim.statusCode).toBe(400);
  });

  it('admin consulta o log de acesso com filtros e paginação', async () => {
    const p = await amb.criarProfissional();
    const admin = await amb.criarProfissional({ perfil: 'ADMIN' });
    const { tokenDeAcesso } = await amb.sessaoDe(p);
    await amb.app.inject({ method: 'GET', url: '/api/auth/me', headers: comToken(tokenDeAcesso) });
    await amb.app.inject({ method: 'GET', url: '/api/auth/me', headers: comToken(tokenDeAcesso) });
    await amb.app.aguardarLogsPendentes();

    const tokenAdmin = (await amb.sessaoDe(admin)).tokenDeAcesso;
    const resposta = await amb.app.inject({
      method: 'GET',
      url: `/api/log/acesso?profissionalId=${p.id}&rota=/auth/me&tamanho=1&pagina=2`,
      headers: comToken(tokenAdmin),
    });
    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo).toMatchObject({ pagina: 2, tamanho: 1, total: 2 });
    expect(corpo.itens).toHaveLength(1);
    expect(corpo.itens[0]).toMatchObject({
      servico: 'ms-auth',
      profissionalId: p.id,
      metodo: 'GET',
      rota: '/api/auth/me',
      statusCode: 200,
    });
  });

  it('admin consulta os logs dos clientes por dispositivo', async () => {
    const p = await amb.criarProfissional();
    const admin = await amb.criarProfissional({ perfil: 'ADMIN' });
    const dispositivo = randomUUID();
    await amb.app.inject({
      method: 'POST',
      url: '/api/log',
      headers: comToken((await amb.sessaoDe(p)).tokenDeAcesso),
      payload: { logs: [logDoCliente(dispositivo, { acao: 'CONECTIVIDADE_ALTERADA', modo: 'ONLINE' })] },
    });

    const resposta = await amb.app.inject({
      method: 'GET',
      url: `/api/log/cliente?dispositivoId=${dispositivo}`,
      headers: comToken((await amb.sessaoDe(admin)).tokenDeAcesso),
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().itens).toEqual([
      expect.objectContaining({ dispositivoId: dispositivo, acao: 'CONECTIVIDADE_ALTERADA', modo: 'ONLINE', enviadoPorId: p.id }),
    ]);
  });
});
