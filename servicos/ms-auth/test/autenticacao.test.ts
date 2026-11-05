import { SignJWT, decodeJwt, importPKCS8 } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarAmbiente, gerarChavesPem, type Ambiente } from './ambiente.js';

let amb: Ambiente;

beforeAll(async () => {
  amb = await criarAmbiente();
});

afterAll(async () => {
  await amb?.encerrar();
});

describe('POST /api/auth/login', () => {
  it('entra com tipo + registro + senha (senha criada no SQL com crypt) e recebe os tokens', async () => {
    const p = await amb.criarProfissional({ tipoRegistro: 'COREN' });
    const resposta = await amb.login(p, {
      dispositivo: { id: '0193f2a0-2222-7000-8000-000000000001', nome: 'Ambulância Teste' },
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.profissional).toEqual({
      id: p.id,
      nome: p.nome,
      tipoRegistro: 'COREN',
      registro: p.registro,
      perfil: 'OPERACIONAL',
    });

    const claims = decodeJwt(corpo.tokenDeAcesso);
    expect(claims.sub).toBe(p.id);
    expect(claims.iss).toBe('medicalfield-auth');
    expect(claims.aud).toBe('medicalfield');
    expect(claims.perfil).toBe('OPERACIONAL');
    expect(claims.registro).toBe(p.registro);
    expect(typeof claims.sid).toBe('string');
    const duracaoSegundos = claims.exp! - claims.iat!;
    expect(duracaoSegundos).toBeGreaterThan(14 * 60);
    expect(duracaoSegundos).toBeLessThanOrEqual(15 * 60);
    expect(new Date(corpo.tokenDeAcessoExpiraEm).getTime()).toBe(claims.exp! * 1000);

    const diasDeSessao = (new Date(corpo.sessaoExpiraEm).getTime() - Date.now()) / 86_400_000;
    expect(diasDeSessao).toBeGreaterThan(6.99);
    expect(diasDeSessao).toBeLessThanOrEqual(7);

    const { rows } = await amb.pool.query(
      'SELECT refresh_token_hash, dispositivo_id, dispositivo_nome FROM auth.sessao WHERE id = $1',
      [claims.sid],
    );
    expect(rows[0].refresh_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].refresh_token_hash).not.toContain(corpo.refreshToken);
    expect(rows[0].dispositivo_id).toBe('0193f2a0-2222-7000-8000-000000000001');
    expect(rows[0].dispositivo_nome).toBe('Ambulância Teste');
  });

  it('não diferencia maiúsculas, minúsculas nem espaços nas pontas do registro', async () => {
    const p = await amb.criarProfissional({ tipoRegistro: 'SOCORRISTA' });
    const resposta = await amb.login({ ...p, registro: `  ${p.registro.toLowerCase()}  ` });
    expect(resposta.statusCode).toBe(200);
  });

  it('responde igual para senha errada e para registro inexistente', async () => {
    const p = await amb.criarProfissional();
    const senhaErrada = await amb.login({ ...p, senha: 'errada' });
    const inexistente = await amb.login({ ...p, registro: 'NAO-EXISTE-999' });

    expect(senhaErrada.statusCode).toBe(401);
    expect(inexistente.statusCode).toBe(401);
    expect(senhaErrada.json()).toEqual(inexistente.json());
    expect(senhaErrada.json().erro).toBe('CREDENCIAIS_INVALIDAS');
  });

  it('bloqueia por 5 minutos na 5ª senha errada seguida, mesmo com a senha certa depois', async () => {
    const p = await amb.criarProfissional();
    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      expect((await amb.login({ ...p, senha: 'errada' })).statusCode).toBe(401);
    }
    const quinta = await amb.login({ ...p, senha: 'errada' });
    expect(quinta.statusCode).toBe(423);
    expect(quinta.json().erro).toBe('CONTA_BLOQUEADA');
    const minutos = (new Date(quinta.json().bloqueadoAte).getTime() - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(4.9);
    expect(minutos).toBeLessThanOrEqual(5);

    const senhaCerta = await amb.login(p);
    expect(senhaCerta.statusCode).toBe(423);
  });

  it('um login certo zera a contagem de erros', async () => {
    const p = await amb.criarProfissional();
    for (let i = 0; i < 4; i++) await amb.login({ ...p, senha: 'errada' });
    expect((await amb.login(p)).statusCode).toBe(200);
    for (let i = 0; i < 4; i++) {
      expect((await amb.login({ ...p, senha: 'errada' })).statusCode).toBe(401);
    }
  });

  it('só informa "inativo" quando a senha confere', async () => {
    const p = await amb.criarProfissional({ ativo: false });
    expect((await amb.login({ ...p, senha: 'errada' })).json().erro).toBe('CREDENCIAIS_INVALIDAS');
    const resposta = await amb.login(p);
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json().erro).toBe('PROFISSIONAL_INATIVO');
  });

  it('valida o corpo e explica o campo com problema', async () => {
    const semSenha = await amb.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { tipoRegistro: 'CRM', registro: '123' },
    });
    expect(semSenha.statusCode).toBe(400);
    expect(semSenha.json()).toMatchObject({
      erro: 'VALIDACAO',
      detalhes: [{ campo: 'senha', mensagem: 'campo obrigatório' }],
    });

    const tipoInvalido = await amb.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { tipoRegistro: 'OAB', registro: '123', senha: 'x' },
    });
    expect(tipoInvalido.statusCode).toBe(400);
    expect(tipoInvalido.json().detalhes[0]).toEqual({
      campo: 'tipoRegistro',
      mensagem: 'valor não permitido (use: CRM, COREN, SOCORRISTA)',
    });

    const jsonQuebrado = await amb.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"tipoRegistro": ',
    });
    expect(jsonQuebrado.statusCode).toBe(400);
    expect(jsonQuebrado.json().erro).toBe('VALIDACAO');
  });
});

describe('token de acesso nas rotas', () => {
  it('sem token, com outro esquema, adulterado, de outra chave ou vencido: 401', async () => {
    const p = await amb.criarProfissional();
    const { tokenDeAcesso } = await amb.sessaoDe(p);
    const claims = decodeJwt(tokenDeAcesso);

    const outrasChaves = await gerarChavesPem();
    const deOutraChave = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'RS256' })
      .sign(await importPKCS8(outrasChaves.privadaPem, 'RS256'));

    const vencido = await new SignJWT({ ...claims, iat: Math.floor(Date.now() / 1000) - 3600 })
      .setProtectedHeader({ alg: 'RS256' })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(await importPKCS8(amb.chaves.privadaPem, 'RS256'));

    const [cabecalho, corpo, assinatura] = tokenDeAcesso.split('.');
    const adulterado = `${cabecalho}.${corpo}.${assinatura!.slice(0, -4)}AAAA`;

    const casos: Array<Record<string, string>> = [
      {},
      { authorization: `Basic ${Buffer.from('a:b').toString('base64')}` },
      { authorization: `Bearer ${adulterado}` },
      { authorization: `Bearer ${deOutraChave}` },
      { authorization: `Bearer ${vencido}` },
    ];
    for (const headers of casos) {
      const resposta = await amb.app.inject({ method: 'GET', url: '/api/auth/me', headers });
      expect(resposta.statusCode).toBe(401);
      expect(resposta.json().erro).toBe('NAO_AUTENTICADO');
    }
  });

  it('GET /api/auth/me devolve o profissional logado', async () => {
    const p = await amb.criarProfissional({ perfil: 'ADMIN' });
    const { tokenDeAcesso } = await amb.sessaoDe(p);
    const resposta = await amb.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${tokenDeAcesso}` },
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      id: p.id,
      nome: p.nome,
      tipoRegistro: p.tipoRegistro,
      registro: p.registro,
      perfil: 'ADMIN',
    });
  });
});

describe('POST /api/auth/refresh e /api/auth/logout', () => {
  const renovar = (refreshToken: string) =>
    amb.app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken } });

  it('renova o token de acesso; o refresh token e o fim da sessão continuam os mesmos', async () => {
    const p = await amb.criarProfissional();
    const sessao = await amb.sessaoDe(p);

    const primeira = await renovar(sessao.refreshToken);
    const segunda = await renovar(sessao.refreshToken);
    expect(primeira.statusCode).toBe(200);
    expect(segunda.statusCode).toBe(200);
    expect(primeira.json().sessaoExpiraEm).toBe(sessao.sessaoExpiraEm);
    expect(decodeJwt(primeira.json().tokenDeAcesso).sub).toBe(p.id);
    expect(primeira.json().tokenDeAcesso).not.toBe(sessao.tokenDeAcesso);

    const sid = decodeJwt(sessao.tokenDeAcesso).sid;
    const { rows } = await amb.pool.query('SELECT ultimo_uso_em FROM auth.sessao WHERE id = $1', [sid]);
    expect(rows[0].ultimo_uso_em).toBeInstanceOf(Date);
  });

  it('depois do logout, o refresh token não vale mais', async () => {
    const p = await amb.criarProfissional();
    const sessao = await amb.sessaoDe(p);
    const saida = await amb.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { authorization: `Bearer ${sessao.tokenDeAcesso}` },
    });
    expect(saida.statusCode).toBe(204);
    expect(saida.body).toBe('');

    const resposta = await renovar(sessao.refreshToken);
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json().erro).toBe('SESSAO_INVALIDA');
  });

  it('sessão vencida não renova', async () => {
    const p = await amb.criarProfissional();
    const sessao = await amb.sessaoDe(p);
    await amb.pool.query(`UPDATE auth.sessao SET expira_em = now() - interval '1 minute' WHERE id = $1`, [
      decodeJwt(sessao.tokenDeAcesso).sid,
    ]);
    expect((await renovar(sessao.refreshToken)).json().erro).toBe('SESSAO_INVALIDA');
  });

  it('o token de acesso renovado nunca passa do fim da sessão', async () => {
    const p = await amb.criarProfissional();
    const sessao = await amb.sessaoDe(p);
    await amb.pool.query(`UPDATE auth.sessao SET expira_em = now() + interval '2 minutes' WHERE id = $1`, [
      decodeJwt(sessao.tokenDeAcesso).sid,
    ]);
    const corpo = (await renovar(sessao.refreshToken)).json();
    expect(new Date(corpo.tokenDeAcessoExpiraEm).getTime()).toBeLessThanOrEqual(new Date(corpo.sessaoExpiraEm).getTime());
  });

  it('profissional desativado não renova, e a sessão dele é revogada', async () => {
    const p = await amb.criarProfissional();
    const sessao = await amb.sessaoDe(p);
    await amb.pool.query('UPDATE auth.profissional SET ativo = false WHERE id = $1', [p.id]);

    const resposta = await renovar(sessao.refreshToken);
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json().erro).toBe('PROFISSIONAL_INATIVO');
    const { rows } = await amb.pool.query('SELECT revogada_em FROM auth.sessao WHERE id = $1', [
      decodeJwt(sessao.tokenDeAcesso).sid,
    ]);
    expect(rows[0].revogada_em).toBeInstanceOf(Date);
  });

  it('refresh token desconhecido ou curto demais', async () => {
    expect((await renovar('x'.repeat(43))).json().erro).toBe('SESSAO_INVALIDA');
    expect((await renovar('curto')).statusCode).toBe(400);
  });
});

describe('GET /api/auth/credenciais-offline (réplica para o login offline, D-51)', () => {
  it('sem token: 401', async () => {
    const resposta = await amb.app.inject({ method: 'GET', url: '/api/auth/credenciais-offline' });
    expect(resposta.statusCode).toBe(401);
  });

  it('qualquer perfil logado recebe os ativos com o hash bcrypt da senha; os inativos ficam de fora', async () => {
    const operacional = await amb.criarProfissional();
    const outro = await amb.criarProfissional({ tipoRegistro: 'COREN', perfil: 'ADMIN', senha: 'Outra@Senha2' });
    const inativo = await amb.criarProfissional({ ativo: false });
    const { tokenDeAcesso } = await amb.sessaoDe(operacional);
    const resposta = await amb.app.inject({
      method: 'GET',
      url: '/api/auth/credenciais-offline',
      headers: { authorization: `Bearer ${tokenDeAcesso}` },
    });
    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json() as {
      geradoEm: string;
      profissionais: { id: string; tipoRegistro: string; registro: string; perfil: string; senhaHash: string }[];
    };
    expect(Number.isNaN(Date.parse(corpo.geradoEm))).toBe(false);
    const ids = corpo.profissionais.map((p) => p.id);
    expect(ids).toContain(operacional.id);
    expect(ids).toContain(outro.id);
    expect(ids).not.toContain(inativo.id);
    const doOutro = corpo.profissionais.find((p) => p.id === outro.id);
    expect(doOutro).toMatchObject({ tipoRegistro: 'COREN', registro: outro.registro, perfil: 'ADMIN' });
    // O hash é o do banco (bcrypt), nunca a senha
    expect(doOutro?.senhaHash).toMatch(/^\$2[aby]\$\d\d\$/);
    expect(JSON.stringify(corpo)).not.toContain(outro.senha);
  });
});
