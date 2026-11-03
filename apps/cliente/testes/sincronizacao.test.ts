/** Gravação local, fila (outbox), envio, recebimento, unificação e logs (docs/07-sincronizacao.md). */
import { afterEach, describe, expect, it } from 'vitest';
import type { DadosPessoa } from '@compartilhado/validacao';
import type { Nucleo } from '../src/main/nucleo/nucleo';
import { ANA, type Aparelho, MEDICAMENTO, PESSOA, SENHA, ServidorFalso, atendimentoBasico, novoAparelho } from './servidor-falso';

const abertos: Aparelho[] = [];
afterEach(async () => {
  while (abertos.length) await abertos.pop()?.fechar();
});

const login = { tipoRegistro: 'CRM' as const, registro: '12345-RS', senha: SENHA };

/** Aparelho logado online, com o "receber dados" feito (já tem o catálogo de medicamentos). */
async function aparelhoPronto(servidor = new ServidorFalso()): Promise<Aparelho> {
  const a = novoAparelho(servidor);
  abertos.push(a);
  await a.nucleo.entrar(login);
  await a.nucleo.motor.sincronizar('COMPLETO');
  return a;
}

/** Pessoa, prontuário e atendimento, como no fluxo "Nova ocorrência". */
async function ocorrencia(nucleo: Nucleo, pessoa: DadosPessoa = PESSOA) {
  const p = await nucleo.criarPessoa(pessoa);
  const pr = await nucleo.criarProntuario(p.id, { tipoSanguineo: 'O+', alergias: 'Dipirona' });
  const at = await nucleo.criarAtendimento(pr.id, atendimentoBasico());
  return { pessoa: p, prontuario: pr, atendimento: at };
}

const statusDaFila = async (nucleo: Nucleo) => (await nucleo.fila()).map((i) => [i.tipo, i.status]).reverse();

describe('um caminho só para gravar (D-11)', () => {
  it('offline: grava no aparelho, enfileira na ordem e não manda nada', async () => {
    const { nucleo, servidor } = await aparelhoPronto();
    await nucleo.mudarConectividade('OFFLINE');
    const antes = servidor.chamadas.length;
    const { pessoa, atendimento } = await ocorrencia(nucleo);

    expect(pessoa.estadoSync).toBe('PENDENTE');
    expect(servidor.chamadas.length).toBe(antes);
    expect(await statusDaFila(nucleo)).toEqual([
      ['CRIAR_PESSOA', 'PENDENTE'],
      ['CRIAR_PRONTUARIO', 'PENDENTE'],
      ['CRIAR_ATENDIMENTO', 'PENDENTE'],
    ]);
    expect(nucleo.estadoAtual().pendentes).toBe(3);
    // A origem guarda quem, onde e como (offline)
    const detalhe = await nucleo.atendimento(atendimento.id);
    expect(detalhe?.origem).toMatchObject({ criadoPorId: ANA.id, criadoPorRegistro: 'CRM 12345-RS', modo: 'OFFLINE', dispositivoNome: 'Ambulância Teste' });
    expect(detalhe?.medicamentos[0]).toMatchObject({ nome: 'Dipirona', dose: 1, unidade: 'G' });
    const acoes = (await nucleo.logsLocais()).map((l) => l.acao);
    expect(acoes).toEqual(expect.arrayContaining(['PESSOA_CRIADA', 'PRONTUARIO_CRIADO', 'ATENDIMENTO_CRIADO']));
  });

  it('ao voltar para Online, a fila sai sozinha, em ordem, e tudo fica sincronizado', async () => {
    const { nucleo, servidor } = await aparelhoPronto();
    await nucleo.mudarConectividade('OFFLINE');
    const { pessoa, prontuario, atendimento } = await ocorrencia(nucleo);
    await nucleo.mudarConectividade('ONLINE');
    await nucleo.motor.sincronizar('ENVIO');

    const envios = servidor.chamadas.filter((c) => c.metodo === 'POST' && /^\/api\/(pessoa|prontuario|atendimento)$/.test(c.caminho));
    expect(envios.map((c) => c.caminho)).toEqual(['/api/pessoa', '/api/prontuario', '/api/atendimento']);
    // O corpo é o JSON exato da API: origem do aparelho, sem o total do Glasgow nem o nome do medicamento
    expect(envios[2]?.corpo).toMatchObject({ id: atendimento.id, prontuarioId: prontuario.id, glasgow: { ocular: 4, verbal: 5, motora: 6 } });
    expect(envios[2]?.corpo.glasgow.total).toBeUndefined();
    expect(envios[2]?.corpo.medicamentos[0].nome).toBeUndefined();
    expect(envios[0]?.corpo.origem.modo).toBe('OFFLINE');
    expect(nucleo.estadoAtual().pendentes).toBe(0);
    expect((await nucleo.paciente(pessoa.id))?.pessoa.estadoSync).toBe('SINCRONIZADO');
    expect((await nucleo.atendimento(atendimento.id))?.estadoSync).toBe('SINCRONIZADO');
  });

  it('online: salvar já dispara o envio', async () => {
    const { nucleo, servidor } = await aparelhoPronto();
    const pessoa = await nucleo.criarPessoa({ nome: 'Paciente Online' });
    await nucleo.motor.sincronizar('ENVIO');
    expect(servidor.pessoas.has(pessoa.id)).toBe(true);
    expect((await nucleo.paciente(pessoa.id))?.pessoa.sincronizacao?.recebidoEm).toBeTruthy();
  });

  it('valida antes de gravar: nada inválido fica parado na fila', async () => {
    const { nucleo } = await aparelhoPronto();
    await expect(nucleo.criarPessoa({ nome: ' ', cpf: '11111111111' })).rejects.toMatchObject({
      codigo: 'VALIDACAO',
      detalhes: [{ campo: 'nome' }, { campo: 'cpf', mensagem: 'CPF inválido' }],
    });
    const pessoa = await nucleo.criarPessoa({ nome: 'Alguém' });
    const pr = await nucleo.criarProntuario(pessoa.id, {});
    const futuro = atendimentoBasico(new Date(Date.now() + 3 * 3_600_000));
    await expect(
      nucleo.criarAtendimento(pr.id, { ...futuro, triagem: { protocolo: 'START', cor: 'LARANJA' }, desfecho: { tipo: 'ENCAMINHADO_HOSPITAL', destino: '' } }),
    ).rejects.toMatchObject({
      detalhes: expect.arrayContaining([
        { campo: 'dataHora', mensagem: 'não pode estar no futuro' },
        { campo: 'triagem.cor', mensagem: 'cor não existe no protocolo START' },
        { campo: 'desfecho.destino', mensagem: 'informe o hospital de destino' },
      ]),
    });
  });
});

describe('respostas do servidor (docs/07, seção 7.4)', () => {
  it('erro definitivo (422) marca o item e segue para o próximo', async () => {
    const { nucleo, servidor } = await aparelhoPronto();
    await nucleo.mudarConectividade('OFFLINE');
    const primeira = await nucleo.criarPessoa({ nome: 'Recusada' });
    const segunda = await nucleo.criarPessoa({ nome: 'Aceita' });
    servidor.forcar('POST', /^\/api\/pessoa$/, () => new Response(JSON.stringify({ erro: 'VALIDACAO', mensagem: 'Há campos inválidos.', detalhes: [{ campo: 'nome', mensagem: 'x' }] }), { status: 400 }));
    await nucleo.mudarConectividade('ONLINE');
    await nucleo.motor.sincronizar('ENVIO');

    const fila = await nucleo.fila();
    expect(fila.find((i) => i.entidadeId === primeira.id)).toMatchObject({ status: 'ERRO', ultimoErro: 'VALIDACAO: Há campos inválidos. (nome: x)' });
    expect(fila.find((i) => i.entidadeId === segunda.id)?.status).toBe('CONCLUIDO');
    expect((await nucleo.paciente(primeira.id))?.pessoa.estadoSync).toBe('ERRO');
    expect(nucleo.estadoAtual().itensComErro).toBe(1);
    expect((await nucleo.logsLocais()).map((l) => l.acao)).toContain('ITEM_COM_ERRO');

    // "Tentar de novo" na tela da fila
    await nucleo.tentarDeNovo(fila.find((i) => i.entidadeId === primeira.id)?.id ?? '');
    await nucleo.motor.sincronizar('ENVIO');
    expect((await nucleo.paciente(primeira.id))?.pessoa.estadoSync).toBe('SINCRONIZADO');
  });

  it('erro temporário (503 ou rede) para a fila, sem furar a ordem, e marca a nova tentativa', async () => {
    const { nucleo, servidor } = await aparelhoPronto();
    await nucleo.mudarConectividade('OFFLINE');
    await nucleo.criarPessoa({ nome: 'Primeira' });
    await nucleo.criarPessoa({ nome: 'Segunda' });
    servidor.forcar('POST', /^\/api\/pessoa$/, () => new Response(JSON.stringify({ erro: 'SERVICO_INDISPONIVEL', mensagem: 'fora' }), { status: 503 }));
    await nucleo.mudarConectividade('ONLINE');
    await nucleo.motor.sincronizar('ENVIO');

    const fila = (await nucleo.fila()).reverse();
    expect(fila.map((i) => i.status)).toEqual(['PENDENTE', 'PENDENTE']);
    expect(fila[0]?.tentativas).toBe(1);
    expect(fila[0]?.proximaTentativaEm).toBeTruthy();
    expect(fila[1]?.tentativas).toBe(0);
    expect(servidor.chamadasPara('POST', '/api/pessoa')).toHaveLength(1);
    expect(nucleo.estadoAtual().servidorAcessivel).toBe(false);
  });

  it('a chave vai para Offline no meio do envio: o item volta para a fila sem contar tentativa', async () => {
    const { nucleo, servidor } = await aparelhoPronto();
    await nucleo.mudarConectividade('OFFLINE');
    const pessoa = await nucleo.criarPessoa({ nome: 'No meio' });
    servidor.forcar('POST', /^\/api\/pessoa$/, () => {
      void nucleo.mudarConectividade('OFFLINE');
      return 'REDE';
    });
    await nucleo.mudarConectividade('ONLINE');
    await nucleo.motor.sincronizar('ENVIO');
    const [item] = await nucleo.fila();
    expect(item).toMatchObject({ entidadeId: pessoa.id, status: 'PENDENTE' });
  });

  it('500 vira erro definitivo na 3ª tentativa', async () => {
    const { nucleo, servidor, relogio } = await aparelhoPronto();
    await nucleo.mudarConectividade('OFFLINE');
    await nucleo.criarPessoa({ nome: 'Com problema' });
    servidor.forcar('POST', /^\/api\/pessoa$/, () => new Response(JSON.stringify({ erro: 'ERRO_INTERNO', mensagem: 'x' }), { status: 500 }), 3);
    await nucleo.mudarConectividade('ONLINE');
    for (let i = 0; i < 3; i += 1) {
      relogio.deslocamentoMs += 10 * 60_000; // passa da espera de nova tentativa
      await nucleo.motor.sincronizar('ENVIO');
    }
    expect((await nucleo.fila())[0]).toMatchObject({ status: 'ERRO', tentativas: 3 });
  });

  it('token recusado (401): renova uma vez e repete', async () => {
    const { nucleo, servidor } = await aparelhoPronto();
    servidor.invalidarTokens();
    const pessoa = await nucleo.criarPessoa({ nome: 'Depois do 401' });
    await nucleo.motor.sincronizar('ENVIO');
    expect(servidor.pessoas.has(pessoa.id)).toBe(true);
    expect(servidor.chamadasPara('POST', '/api/auth/refresh').length).toBeGreaterThanOrEqual(1);
  });

  it('falha do servidor de e-mail (502) não trava a fila (D-39)', async () => {
    const { nucleo, servidor } = await aparelhoPronto();
    const { atendimento } = await ocorrencia(nucleo, { nome: 'Com e-mail', cpf: '', telefone: '' });
    await nucleo.motor.sincronizar('ENVIO');
    await nucleo.mudarConectividade('OFFLINE');
    await nucleo.pedirEmail(atendimento.id, { tipo: 'OUTRO', email: 'hospital@exemplo.com' });
    const depois = await nucleo.criarPessoa({ nome: 'Depois do e-mail' });
    servidor.forcar('POST', /\/email$/, () => new Response(JSON.stringify({ erro: 'FALHA_ENVIO_EMAIL', mensagem: 'smtp' }), { status: 502 }));
    await nucleo.mudarConectividade('ONLINE');
    await nucleo.motor.sincronizar('ENVIO');

    expect(servidor.pessoas.has(depois.id)).toBe(true);
    const [pedido] = (await nucleo.atendimento(atendimento.id))?.emails ?? [];
    expect(pedido).toMatchObject({ status: 'PENDENTE', ultimoErro: 'FALHA_ENVIO_EMAIL: smtp' });
  });
});

describe('unificação de duplicados (docs/07, seção 7.6)', () => {
  it('a mesma pessoa em duas ambulâncias offline: o servidor junta e o aparelho fica com uma só', async () => {
    const servidor = new ServidorFalso();
    const ambulancia1 = await aparelhoPronto(servidor);
    const ambulancia2 = await aparelhoPronto(servidor);
    await ambulancia1.nucleo.mudarConectividade('OFFLINE');
    await ambulancia2.nucleo.mudarConectividade('OFFLINE');
    await ocorrencia(ambulancia1.nucleo, { ...PESSOA, telefone: '51911110000' });
    const daSegunda = await ocorrencia(ambulancia2.nucleo, { ...PESSOA, telefone: '51922220000' });

    await ambulancia1.nucleo.mudarConectividade('ONLINE');
    await ambulancia1.nucleo.motor.sincronizar('ENVIO');
    await ambulancia2.nucleo.mudarConectividade('ONLINE');
    await ambulancia2.nucleo.motor.sincronizar('COMPLETO');

    const nucleo = ambulancia2.nucleo;
    const pessoas = await nucleo.buscarPessoas('Maria');
    expect(pessoas).toHaveLength(1);
    const mantida = pessoas[0];
    expect(mantida?.id).not.toBe(daSegunda.pessoa.id);
    expect(mantida?.telefone).toBe('51922220000'); // o mais recente vence (no servidor falso, simplificado)
    const paciente = await nucleo.paciente(mantida?.id ?? '');
    expect(paciente?.prontuarios).toHaveLength(1);
    // Os dois atendimentos (um de cada ambulância) ficam no prontuário mantido
    expect(paciente?.atendimentos).toHaveLength(2);
    expect((await nucleo.atendimento(daSegunda.atendimento.id))?.estadoSync).toBe('SINCRONIZADO');
    const unificacoes = (await nucleo.logsLocais()).filter((l) => l.acao === 'REGISTRO_UNIFICADO');
    expect(unificacoes.map((l) => l.detalhes?.entidade).sort()).toEqual(['PESSOA', 'PRONTUARIO']);
  });
});

describe('unificação pelo "receber dados" (docs/07, seção 7.6)', () => {
  it('uma unificação que o aparelho não soube na hora chega pelo pull e também é aplicada', async () => {
    const servidor = new ServidorFalso();
    const { nucleo } = await aparelhoPronto(servidor);
    const { pessoa, prontuario } = await ocorrencia(nucleo, { nome: 'Cadastro Duplicado' });
    await nucleo.motor.sincronizar('ENVIO');

    // No servidor, outra ambulância já tinha a mesma pessoa: a deste aparelho foi absorvida por ela
    const mantida = { ...servidor.pessoas.get(pessoa.id)!, id: '0193f000-0000-7000-8000-0000000009ff', nome: 'Cadastro Mantido' };
    servidor.pessoas.delete(pessoa.id);
    servidor.pessoas.set(mantida.id, mantida);
    servidor.prontuarios.set(prontuario.id, { ...servidor.prontuarios.get(prontuario.id)!, pessoaId: mantida.id });
    servidor.unificacoes.push({ entidade: 'PESSOA', idDescartado: pessoa.id, idMantido: mantida.id });

    await nucleo.motor.sincronizar('COMPLETO');
    expect(await nucleo.paciente(pessoa.id)).toBeNull();
    const paciente = await nucleo.paciente(mantida.id);
    expect(paciente?.pessoa.nome).toBe('Cadastro Mantido');
    expect(paciente?.prontuarios.map((p) => p.id)).toEqual([prontuario.id]);
    expect(paciente?.atendimentos).toHaveLength(1);
  });
});

describe('recebimento (pull) e logs', () => {
  it('traz o que mudou no servidor, guarda o cursor e manda na próxima vez', async () => {
    const servidor = new ServidorFalso();
    servidor.medicamentos = [MEDICAMENTO, { ...MEDICAMENTO, id: '0193f000-0000-7000-8000-000000000502', nome: 'Cetoprofeno', ativo: true }];
    const { nucleo } = await aparelhoPronto(servidor);
    expect((await nucleo.medicamentosAtivos()).map((m) => m.nome)).toEqual(['Cetoprofeno', 'Dipirona']);
    await nucleo.motor.sincronizar('COMPLETO');
    const pulls = servidor.chamadasPara('GET', '/api/sync/pull');
    expect(pulls[0]?.consulta.get('desde')).toBeNull();
    expect(pulls[1]?.consulta.get('desde')).toBeTruthy();
    expect(nucleo.estadoAtual().ultimaSincronizacaoEm).toBeTruthy();
  });

  it('os logs do aparelho sobem em lote, com o dispositivo, e não sobem duas vezes', async () => {
    const { nucleo, servidor } = await aparelhoPronto();
    await nucleo.mudarConectividade('OFFLINE');
    await nucleo.criarPessoa({ nome: 'Para o log' });
    await nucleo.mudarConectividade('ONLINE');
    await nucleo.motor.sincronizar('COMPLETO');
    const acoes = servidor.logs.map((l) => l.acao);
    expect(acoes).toEqual(expect.arrayContaining(['LOGIN_ONLINE', 'CONECTIVIDADE_ALTERADA', 'PESSOA_CRIADA']));
    expect(servidor.logs.find((l) => l.acao === 'PESSOA_CRIADA')).toMatchObject({ modo: 'OFFLINE', dispositivoNome: 'Ambulância Teste', profissionalId: ANA.id });
    expect(new Set(servidor.logs.map((l) => l.id)).size).toBe(servidor.logs.length);
    expect((await nucleo.logsLocais()).filter((l) => l.acao === 'PESSOA_CRIADA').every((l) => l.enviadoEm)).toBe(true);
  });
});

describe('PDF e e-mail', () => {
  it('PDF só de atendimento sincronizado e online; salva onde a pessoa escolher', async () => {
    const a = await aparelhoPronto();
    await a.nucleo.mudarConectividade('OFFLINE');
    const { atendimento } = await ocorrencia(a.nucleo);
    await expect(a.nucleo.baixarPdf(atendimento.id)).rejects.toMatchObject({ codigo: 'NAO_SINCRONIZADO' });
    await a.nucleo.mudarConectividade('ONLINE');
    await a.nucleo.motor.sincronizar('ENVIO');
    const resultado = await a.nucleo.baixarPdf(atendimento.id);
    expect(resultado?.salvoEm).toMatch(/ficha-atendimento-TESTE\.pdf$/);
    expect(new TextDecoder().decode(a.arquivos[0]?.conteudo)).toBe('%PDF-1.7 ficha');
    await a.nucleo.mudarConectividade('OFFLINE');
    await expect(a.nucleo.baixarPdf(atendimento.id)).rejects.toMatchObject({ codigo: 'OFFLINE' });
  });

  it('o pedido de e-mail vai pela fila, com o ID do pedido como chave de idempotência', async () => {
    const { nucleo, servidor } = await aparelhoPronto();
    await nucleo.mudarConectividade('OFFLINE');
    const { atendimento } = await ocorrencia(nucleo, { nome: 'Sem e-mail' });
    await expect(nucleo.pedirEmail(atendimento.id, { tipo: 'PACIENTE' })).rejects.toMatchObject({ codigo: 'PACIENTE_SEM_EMAIL' });
    await expect(nucleo.pedirEmail(atendimento.id, { tipo: 'OUTRO', email: 'invalido' })).rejects.toMatchObject({ codigo: 'VALIDACAO' });
    const pedido = await nucleo.pedirEmail(atendimento.id, { tipo: 'OUTRO', email: 'hospital@exemplo.com' });
    expect(await statusDaFila(nucleo)).toEqual([
      ['CRIAR_PESSOA', 'PENDENTE'],
      ['CRIAR_PRONTUARIO', 'PENDENTE'],
      ['CRIAR_ATENDIMENTO', 'PENDENTE'],
      ['ENVIAR_EMAIL', 'PENDENTE'],
    ]);
    await nucleo.mudarConectividade('ONLINE');
    await nucleo.motor.sincronizar('ENVIO');
    expect(servidor.emails).toEqual([{ id: pedido.id, destinatario: { tipo: 'OUTRO', email: 'hospital@exemplo.com' } }]);
    const [enviado] = (await nucleo.atendimento(atendimento.id))?.emails ?? [];
    expect(enviado).toMatchObject({ status: 'CONCLUIDO', resultado: { status: 'ENVIADO', destinatarioEmail: 'hospital@exemplo.com' } });
  });
});
