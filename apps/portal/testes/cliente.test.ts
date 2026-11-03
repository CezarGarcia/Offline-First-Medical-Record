import { describe, expect, it } from 'vitest';
import { ClienteApi, SESSAO_TERMINOU, nomeDoArquivo } from '../src/api/cliente';
import { ErroDaApi, ErroDeRede } from '../src/api/erros';
import { ArmazemDaSessao } from '../src/api/sessao';
import { ApiFalsa, erro, json, respostaDeLogin } from './ambiente';

/** sessionStorage de mentira, só para este teste. */
class ArmazenamentoEmMemoria implements Storage {
  private dados = new Map<string, string>();
  get length() {
    return this.dados.size;
  }
  clear() {
    this.dados.clear();
  }
  getItem(chave: string) {
    return this.dados.get(chave) ?? null;
  }
  key(indice: number) {
    return [...this.dados.keys()][indice] ?? null;
  }
  removeItem(chave: string) {
    this.dados.delete(chave);
  }
  setItem(chave: string, valor: string) {
    this.dados.set(chave, valor);
  }
}

function montar(minutosDoToken = 15) {
  const sessao = new ArmazemDaSessao(new ArmazenamentoEmMemoria());
  sessao.salvar(respostaDeLogin('ADMIN', minutosDoToken));
  const falsa = new ApiFalsa();
  const cliente = new ClienteApi(sessao, '/api', falsa.buscar);
  return { sessao, falsa, cliente };
}

const renovado = (token: string) =>
  json(200, {
    tokenDeAcesso: token,
    tokenDeAcessoExpiraEm: new Date(Date.now() + 15 * 60_000).toISOString(),
    sessaoExpiraEm: new Date(Date.now() + 86_400_000).toISOString(),
  });

describe('ClienteApi', () => {
  it('manda o token e a consulta, sem os filtros vazios', async () => {
    const { falsa, cliente } = montar();
    falsa.em('GET /api/log/acesso', json(200, { itens: [], pagina: 1, tamanho: 50, total: 0 }));
    await cliente.json('/log/acesso', { consulta: { servico: 'ms-docs', rota: '', profissionalId: null, pagina: 1 } });
    const [chamada] = falsa.chamadas;
    expect(chamada?.url).toBe('/api/log/acesso?servico=ms-docs&pagina=1');
    expect(chamada?.cabecalhos.authorization).toBe('Bearer token-admin');
  });

  it('com 401, renova o token uma vez e repete a requisição com o token novo', async () => {
    const { sessao, falsa, cliente } = montar();
    let tentativas = 0;
    falsa.em('GET /api/pessoa', () => (++tentativas === 1 ? erro(401, 'NAO_AUTENTICADO') : json(200, [])));
    falsa.em('POST /api/auth/refresh', renovado('token-novo'));

    await expect(cliente.json('/pessoa')).resolves.toEqual([]);

    expect(falsa.chamadasPara('POST', '/api/auth/refresh')).toHaveLength(1);
    expect(falsa.chamadasPara('POST', '/api/auth/refresh')[0]?.corpo).toEqual({
      refreshToken: 'refresh-token-de-teste-com-mais-de-vinte-caracteres',
    });
    expect(falsa.chamadasPara('GET', '/api/pessoa')[1]?.cabecalhos.authorization).toBe('Bearer token-novo');
    expect(sessao.atual()?.tokenDeAcesso).toBe('token-novo');
    // O refresh token continua o mesmo (D-06: sem rotação)
    expect(sessao.atual()?.refreshToken).toBe('refresh-token-de-teste-com-mais-de-vinte-caracteres');
  });

  it('várias requisições com 401 ao mesmo tempo esperam uma renovação só', async () => {
    const { falsa, cliente } = montar();
    falsa.em('GET /api/pessoa', (c) =>
      c.cabecalhos.authorization === 'Bearer token-novo' ? json(200, []) : erro(401, 'NAO_AUTENTICADO'),
    );
    falsa.em('POST /api/auth/refresh', async () => {
      await new Promise((r) => setTimeout(r, 20));
      return renovado('token-novo');
    });
    await Promise.all([cliente.json('/pessoa'), cliente.json('/pessoa'), cliente.json('/pessoa')]);
    expect(falsa.chamadasPara('POST', '/api/auth/refresh')).toHaveLength(1);
  });

  it('se a renovação é recusada, encerra a sessão com o aviso', async () => {
    const { sessao, falsa, cliente } = montar();
    falsa.em('GET /api/pessoa', erro(401, 'NAO_AUTENTICADO'));
    falsa.em('POST /api/auth/refresh', erro(401, 'SESSAO_INVALIDA'));
    await expect(cliente.json('/pessoa')).rejects.toMatchObject({ status: 401, codigo: 'NAO_AUTENTICADO' });
    expect(sessao.atual()).toBeNull();
    expect(sessao.motivoDoFim).toBe(SESSAO_TERMINOU);
  });

  it('renova antes de mandar quando o token está para vencer', async () => {
    const { falsa, cliente } = montar(0.2); // 12 segundos
    falsa.em('POST /api/auth/refresh', renovado('token-novo'));
    falsa.em('GET /api/medicamento', json(200, []));
    await cliente.json('/medicamento');
    expect(falsa.chamadas.map((c) => c.caminho)).toEqual(['/api/auth/refresh', '/api/medicamento']);
    expect(falsa.chamadas[1]?.cabecalhos.authorization).toBe('Bearer token-novo');
  });

  it('erro da API vira ErroDaApi com código, mensagem e detalhes; rede fora vira ErroDeRede', async () => {
    const { falsa, cliente } = montar();
    falsa.em(
      'POST /api/documentos/ficha/:id/email',
      erro(400, 'VALIDACAO', 'Há campos inválidos.', { detalhes: [{ campo: 'destinatario.email', mensagem: 'obrigatório' }] }),
    );
    const falha = await cliente.json('/documentos/ficha/x/email', { metodo: 'POST', corpo: {} }).catch((e: unknown) => e);
    expect(falha).toBeInstanceOf(ErroDaApi);
    expect(falha).toMatchObject({ status: 400, codigo: 'VALIDACAO', detalhes: [{ campo: 'destinatario.email' }] });

    falsa.buscar.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(cliente.json('/pessoa')).rejects.toBeInstanceOf(ErroDeRede);
  });

  it('logout encerra a sessão no servidor e no navegador, mesmo sem rede', async () => {
    const { sessao, falsa, cliente } = montar();
    falsa.em('POST /api/auth/logout', json(204, null));
    await cliente.logout();
    expect(falsa.chamadasPara('POST', '/api/auth/logout')[0]?.cabecalhos.authorization).toBe('Bearer token-admin');
    expect(sessao.atual()).toBeNull();

    const outro = montar();
    outro.falsa.buscar.mockRejectedValue(new TypeError('Failed to fetch'));
    await outro.cliente.logout();
    expect(outro.sessao.atual()).toBeNull();
  });

  it('lê o nome do arquivo do Content-Disposition', () => {
    expect(nomeDoArquivo('attachment; filename="ficha-atendimento-9F3A1C2B.pdf"')).toBe('ficha-atendimento-9F3A1C2B.pdf');
    expect(nomeDoArquivo(null)).toBeNull();
  });
});

describe('ArmazemDaSessao', () => {
  it('descarta uma sessão vencida guardada no navegador', () => {
    const armazenamento = new ArmazenamentoEmMemoria();
    const vencida = { ...respostaDeLogin(), sessaoExpiraEm: new Date(Date.now() - 1000).toISOString() };
    armazenamento.setItem('medicalfield.portal.sessao', JSON.stringify(vencida));
    expect(new ArmazemDaSessao(armazenamento).atual()).toBeNull();
    expect(armazenamento.length).toBe(0);
  });

  it('avisa quem está ouvindo quando entra e quando sai', () => {
    const sessao = new ArmazemDaSessao(new ArmazenamentoEmMemoria());
    let avisos = 0;
    const parar = sessao.assinar(() => {
      avisos += 1;
    });
    sessao.salvar(respostaDeLogin());
    sessao.encerrar('saiu');
    parar();
    sessao.salvar(respostaDeLogin());
    expect(avisos).toBe(2);
  });
});
