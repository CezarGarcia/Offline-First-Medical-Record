/** Login online e offline, sessão mantida e a chave Online/Offline (docs/08, seções 8.5 e 8.6; docs/07, 7.2). */
import { afterEach, describe, expect, it } from 'vitest';
import { ErroOffline } from '../src/main/nucleo/http';
import { ANA, type Aparelho, CARLOS, SENHA, SENHA_DO_CARLOS, json, novoAparelho, semCofre } from './servidor-falso';

const abertos: Aparelho[] = [];
function aparelho(...argumentos: Parameters<typeof novoAparelho>): Aparelho {
  const a = novoAparelho(...argumentos);
  abertos.push(a);
  return a;
}

afterEach(async () => {
  while (abertos.length) await abertos.pop()?.fechar();
});

const login = (senha = SENHA) => ({ tipoRegistro: 'CRM' as const, registro: ' 12345-rs ', senha });

async function erroDe(promessa: Promise<unknown>) {
  try {
    await promessa;
  } catch (erro) {
    return erro as { codigo: string; message: string; extras?: { bloqueadoAte?: string } };
  }
  throw new Error('deveria ter dado erro');
}

describe('chave Online/Offline (interruptor geral, D-14)', () => {
  it('com a chave em Offline, nenhuma requisição sai do aparelho', async () => {
    const { nucleo, servidor } = aparelho();
    await nucleo.mudarConectividade('OFFLINE');
    await expect(nucleo.http.requisitar('/medicamento')).rejects.toBeInstanceOf(ErroOffline);
    expect(servidor.chamadas).toHaveLength(0);
  });

  it('a posição da chave fica guardada e cada troca vira log local', async () => {
    const a = aparelho();
    await a.nucleo.mudarConectividade('OFFLINE');
    const reaberto = await a.reabrir();
    abertos.push(reaberto);
    expect(reaberto.nucleo.estadoAtual().conectividade).toBe('OFFLINE');
    expect((await reaberto.nucleo.logsLocais()).map((l) => l.acao)).toContain('CONECTIVIDADE_ALTERADA');
  });
});

describe('login online', () => {
  it('entra, guarda o verificador da senha e a sessão (com o refresh token cifrado)', async () => {
    const { nucleo, servidor } = aparelho();
    const resultado = await nucleo.entrar(login());
    expect(resultado).toEqual({ modo: 'ONLINE', aviso: null });
    expect(nucleo.estadoAtual().sessao?.profissional.nome).toBe(ANA.nome);
    const credencial = nucleo.banco.um<{ verificador: string; registro: string }>('SELECT * FROM credencial_offline');
    expect(credencial?.registro).toBe('12345-RS');
    expect(credencial?.verificador).not.toContain(SENHA);
    const sessao = nucleo.banco.um<{ refresh_token_cifrado: Uint8Array }>('SELECT * FROM sessao');
    expect(new TextDecoder().decode(sessao?.refresh_token_cifrado)).toMatch(/^cifrado:refresh-/);
    // O login vai com o dispositivo, e o aparelho se identifica em todas as requisições
    const [chamada] = servidor.chamadasPara('POST', '/api/auth/login');
    expect(chamada?.corpo.dispositivo.nome).toBe('Ambulância Teste');
    expect(chamada?.cabecalhos['x-dispositivo-nome']).toBe('Ambul%C3%A2ncia%20Teste');
    expect((await nucleo.logsLocais()).map((l) => l.acao)).toContain('LOGIN_ONLINE');
  });

  it('senha errada no servidor não tenta offline', async () => {
    const { nucleo } = aparelho();
    expect((await erroDe(nucleo.entrar(login('errada')))).codigo).toBe('CREDENCIAIS_INVALIDAS');
    expect(nucleo.estadoAtual().sessao).toBeNull();
  });

  it('servidor fora do ar: entra offline, com aviso, se já entrou online antes', async () => {
    const a = aparelho();
    await a.nucleo.entrar(login());
    await a.nucleo.sair();
    a.servidor.fora = true;
    expect(await a.nucleo.entrar(login())).toEqual({ modo: 'OFFLINE', aviso: 'Servidor inacessível: entrou em modo offline.' });
  });
});

describe('login offline (D-07)', () => {
  async function comCredencial() {
    const a = aparelho();
    await a.nucleo.entrar(login());
    await a.nucleo.sair();
    await a.nucleo.mudarConectividade('OFFLINE');
    return a;
  }

  it('entra offline com a senha certa e não fala com o servidor', async () => {
    const { nucleo, servidor } = await comCredencial();
    const antes = servidor.chamadas.length;
    expect(await nucleo.entrar(login())).toEqual({ modo: 'OFFLINE', aviso: null });
    expect(nucleo.estadoAtual().sessao).toMatchObject({ modoLogin: 'OFFLINE', profissional: { id: ANA.id } });
    expect(servidor.chamadas.length).toBe(antes);
    expect((await nucleo.logsLocais()).map((l) => l.acao)).toContain('LOGIN_OFFLINE');
  });

  it('primeiro acesso neste aparelho precisa de conexão', async () => {
    const { nucleo } = aparelho();
    await nucleo.mudarConectividade('OFFLINE');
    const erro = await erroDe(nucleo.entrar(login()));
    expect(erro.codigo).toBe('PRIMEIRO_ACESSO');
    expect(erro.message).toBe('O primeiro acesso neste aparelho precisa de conexão.');
  });

  it('5 senhas erradas seguidas bloqueiam por 5 minutos, mesmo com a senha certa depois', async () => {
    const { nucleo, relogio } = await comCredencial();
    for (let i = 1; i <= 4; i += 1) expect((await erroDe(nucleo.entrar(login('errada')))).codigo).toBe('CREDENCIAIS_INVALIDAS');
    const quinta = await erroDe(nucleo.entrar(login('errada')));
    expect(quinta.codigo).toBe('CONTA_BLOQUEADA');
    expect(quinta.message).toMatch(/Bloqueado até \d\d:\d\d/);
    expect((await erroDe(nucleo.entrar(login()))).codigo).toBe('CONTA_BLOQUEADA');
    relogio.deslocamentoMs = 5 * 60_000 + 1_000;
    expect((await nucleo.entrar(login())).modo).toBe('OFFLINE');
  });

  it('vence 7 dias depois da última validação online', async () => {
    const { nucleo, relogio } = await comCredencial();
    relogio.deslocamentoMs = 7 * 24 * 3_600_000 + 1_000;
    expect((await erroDe(nucleo.entrar(login()))).codigo).toBe('CREDENCIAL_VENCIDA');
  });

  it('ao voltar a conexão, faz o login online sozinho com a senha que ficou na memória', async () => {
    const { nucleo, servidor } = await comCredencial();
    await nucleo.entrar(login());
    const loginsAntes = servidor.chamadasPara('POST', '/api/auth/login').length;
    await nucleo.mudarConectividade('ONLINE');
    await nucleo.motor.sincronizar('COMPLETO');
    expect(servidor.chamadasPara('POST', '/api/auth/login').length).toBe(loginsAntes + 1);
    // Voltou a conexão: sincronizou (o "receber dados" do 1º login e pelo menos mais um)
    expect(servidor.chamadasPara('GET', '/api/sync/pull').length).toBeGreaterThanOrEqual(2);
    expect(nucleo.estadoAtual().sessao?.precisaLoginOnline).toBe(false);
  });
});

describe('login offline pela réplica de credenciais (D-51)', () => {
  const doCarlos = (senha = SENHA_DO_CARLOS) => ({ tipoRegistro: 'SOCORRISTA' as const, registro: 'soc-0001', senha });

  /** Um aparelho onde só a Dra. Ana entrou online (e sincronizou); depois, sem rede. */
  async function sincronizadoPelaAna(cofre = undefined as Parameters<typeof novoAparelho>[3]) {
    const a = aparelho(undefined, undefined, true, cofre);
    await a.nucleo.entrar(login());
    await a.nucleo.motor.sincronizar('COMPLETO');
    await a.nucleo.sair();
    await a.nucleo.mudarConectividade('OFFLINE');
    return a;
  }

  it('quem nunca entrou neste aparelho entra offline, com a senha conferida pelo hash da réplica', async () => {
    const { nucleo, servidor } = await sincronizadoPelaAna();
    expect(servidor.chamadasPara('GET', '/api/auth/credenciais-offline').length).toBeGreaterThanOrEqual(1);
    const antes = servidor.chamadas.length;
    expect(await nucleo.entrar(doCarlos())).toEqual({ modo: 'OFFLINE', aviso: null });
    expect(nucleo.estadoAtual().sessao).toMatchObject({ modoLogin: 'OFFLINE', profissional: { id: CARLOS.id, nome: CARLOS.nome } });
    expect(servidor.chamadas.length).toBe(antes);
    // O hash fica no disco só cifrado pelo cofre do sistema
    const linha = nucleo.banco.um<{ senha_hash_cifrado: Uint8Array }>(
      'SELECT senha_hash_cifrado FROM credencial_servidor WHERE profissional_id = :id',
      { id: CARLOS.id },
    );
    expect(new TextDecoder().decode(linha?.senha_hash_cifrado)).toMatch(/^cifrado:\$2[aby]\$/);
  });

  it('senha errada conta tentativas na réplica; 5 seguidas bloqueiam por 5 minutos', async () => {
    const { nucleo, relogio } = await sincronizadoPelaAna();
    for (let i = 1; i <= 4; i += 1) expect((await erroDe(nucleo.entrar(doCarlos('errada')))).codigo).toBe('CREDENCIAIS_INVALIDAS');
    expect((await erroDe(nucleo.entrar(doCarlos('errada')))).codigo).toBe('CONTA_BLOQUEADA');
    expect((await erroDe(nucleo.entrar(doCarlos()))).codigo).toBe('CONTA_BLOQUEADA');
    relogio.deslocamentoMs = 5 * 60_000 + 1_000;
    expect((await nucleo.entrar(doCarlos())).modo).toBe('OFFLINE');
  });

  it('registro fora da réplica responde como senha errada, sem revelar quem existe', async () => {
    const { nucleo } = await sincronizadoPelaAna();
    const erro = await erroDe(nucleo.entrar({ tipoRegistro: 'CRM', registro: '99999-RS', senha: 'qualquer' }));
    expect(erro.codigo).toBe('CREDENCIAIS_INVALIDAS');
  });

  it('a réplica vence 7 dias depois da sincronização', async () => {
    const { nucleo, relogio } = await sincronizadoPelaAna();
    relogio.deslocamentoMs = 7 * 24 * 3_600_000 + 1_000;
    expect((await erroDe(nucleo.entrar(doCarlos()))).codigo).toBe('CREDENCIAL_VENCIDA');
  });

  it('a sessão aberta pela réplica continua depois de fechar e abrir o app', async () => {
    const a = await sincronizadoPelaAna();
    await a.nucleo.entrar(doCarlos());
    const reaberto = await a.reabrir();
    abertos.push(reaberto);
    expect(reaberto.nucleo.estadoAtual().sessao?.profissional.id).toBe(CARLOS.id);
  });

  it('desativado no servidor (fora da lista): perde o acesso offline neste aparelho, inclusive a credencial própria', async () => {
    const a = await sincronizadoPelaAna();
    await a.nucleo.mudarConectividade('ONLINE');
    await a.nucleo.entrar(login());
    a.servidor.ativos = a.servidor.ativos.filter((p) => p.id !== CARLOS.id);
    await a.nucleo.motor.sincronizar('COMPLETO');
    await a.nucleo.sair();
    await a.nucleo.mudarConectividade('OFFLINE');
    expect((await erroDe(a.nucleo.entrar(doCarlos()))).codigo).toBe('CREDENCIAIS_INVALIDAS');
    // A Ana continua na lista: entra normalmente
    expect((await a.nucleo.entrar(login())).modo).toBe('OFFLINE');
  });

  it('sem cofre no sistema, a réplica não vai para o disco e vale só a credencial do próprio aparelho', async () => {
    const { nucleo } = await sincronizadoPelaAna(semCofre);
    expect(nucleo.banco.um('SELECT 1 FROM credencial_servidor')).toBeUndefined();
    expect((await erroDe(nucleo.entrar(doCarlos()))).codigo).toBe('PRIMEIRO_ACESSO');
    expect((await nucleo.entrar(login())).modo).toBe('OFFLINE');
  });
});

describe('sessão mantida (docs/08, 8.6)', () => {
  it('fechar e abrir o app mantém o login; o token é renovado pelo refresh token', async () => {
    const a = aparelho();
    await a.nucleo.entrar(login());
    await a.nucleo.motor.sincronizar('COMPLETO');
    const reaberto = await a.reabrir();
    abertos.push(reaberto);
    expect(reaberto.nucleo.estadoAtual().sessao).toMatchObject({ modoLogin: 'ONLINE', precisaLoginOnline: false });
    await reaberto.nucleo.motor.sincronizar('COMPLETO');
    expect(a.servidor.chamadasPara('POST', '/api/auth/refresh')).toHaveLength(1);
  });

  it('sessão aberta offline e app reaberto: pede login online para sincronizar, sem perder nada', async () => {
    const a = aparelho();
    await a.nucleo.entrar(login());
    await a.nucleo.sair();
    await a.nucleo.mudarConectividade('OFFLINE');
    await a.nucleo.entrar(login());
    const reaberto = await a.reabrir();
    abertos.push(reaberto);
    expect(reaberto.nucleo.estadoAtual().sessao).toMatchObject({ modoLogin: 'OFFLINE', precisaLoginOnline: true });
    await reaberto.nucleo.mudarConectividade('ONLINE');
    await reaberto.nucleo.confirmarSenhaOnline(SENHA);
    expect(reaberto.nucleo.estadoAtual().sessao?.precisaLoginOnline).toBe(false);
  });

  it('servidor recusa a renovação: o app continua, mas só sincroniza depois de entrar online de novo', async () => {
    const a = aparelho();
    await a.nucleo.entrar(login());
    const reaberto = await a.reabrir();
    abertos.push(reaberto);
    a.servidor.invalidarSessoes();
    await reaberto.nucleo.motor.sincronizar('COMPLETO');
    expect(reaberto.nucleo.estadoAtual().sessao).toMatchObject({ precisaLoginOnline: true });
    await reaberto.nucleo.confirmarSenhaOnline(SENHA);
    expect(reaberto.nucleo.estadoAtual().sessao?.precisaLoginOnline).toBe(false);
  });

  it('profissional desativado no servidor: a sessão acaba e a credencial offline é apagada', async () => {
    const a = aparelho();
    await a.nucleo.entrar(login());
    const reaberto = await a.reabrir();
    abertos.push(reaberto);
    a.servidor.forcar('POST', /^\/api\/auth\/refresh$/, () => json(403, { erro: 'PROFISSIONAL_INATIVO', mensagem: 'Profissional desativado.' }));
    await reaberto.nucleo.motor.sincronizar('COMPLETO');
    expect(reaberto.nucleo.estadoAtual()).toMatchObject({ sessao: null, motivoDoFimDaSessao: 'Este profissional foi desativado no servidor.' });
    expect(reaberto.nucleo.banco.um('SELECT * FROM credencial_offline')).toBeUndefined();
    expect(reaberto.nucleo.banco.um('SELECT * FROM credencial_servidor WHERE profissional_id = :id', { id: ANA.id })).toBeUndefined();
    await reaberto.nucleo.mudarConectividade('OFFLINE');
    // O aparelho ainda conhece outros profissionais (a réplica): responde como senha errada, sem revelar quem existe
    await expect(reaberto.nucleo.entrar(login())).rejects.toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS' });
  });

  it('sair com a chave em Offline apaga a sessão sem falar com o servidor', async () => {
    const { nucleo, servidor } = aparelho();
    await nucleo.entrar(login());
    await nucleo.mudarConectividade('OFFLINE');
    const antes = servidor.chamadas.length;
    await nucleo.sair();
    expect(servidor.chamadas).toHaveLength(antes);
    expect(nucleo.estadoAtual().sessao).toBeNull();
    expect(nucleo.banco.um('SELECT * FROM sessao')).toBeUndefined();
  });

  it('sair avisa o servidor e apaga a sessão, mas a credencial offline continua', async () => {
    const { nucleo, servidor } = aparelho();
    await nucleo.entrar(login());
    await nucleo.sair();
    expect(servidor.chamadasPara('POST', '/api/auth/logout')).toHaveLength(1);
    expect(nucleo.estadoAtual().sessao).toBeNull();
    expect(nucleo.banco.um('SELECT * FROM credencial_offline')).toBeDefined();
    expect((await nucleo.logsLocais()).map((l) => l.acao)).toContain('LOGOUT');
  });
});
