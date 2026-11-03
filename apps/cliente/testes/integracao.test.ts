/**
 * Integração com o servidor de verdade (Nginx + ms-auth + ms-clinico + ms-docs): o lado do app cliente do
 * roteiro de testes (docs/11), com aparelhos simulados pelo núcleo local. Fica de fora sem as variáveis:
 *
 *   MEDICALFIELD_URL=http://127.0.0.1:8088 MEDICALFIELD_SENHA=<DEMO_SENHA> npm run test:integracao
 *
 * Opcional: MEDICALFIELD_EMAIL_TESTE=<endereço> também testa o envio da ficha por e-mail.
 * Cria pessoas e atendimentos de teste no banco: use na pilha local, não na VM da apresentação.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TipoRegistro } from '@compartilhado/tipos';
import type { DadosAtendimento } from '@compartilhado/validacao';
import { afterEach, describe, expect, it } from 'vitest';
import { Nucleo } from '../src/main/nucleo/nucleo';
import { cofreFalso } from './servidor-falso';

const URL_DO_SERVIDOR = process.env.MEDICALFIELD_URL;
const SENHA = process.env.MEDICALFIELD_SENHA ?? '';
const EMAIL_TESTE = process.env.MEDICALFIELD_EMAIL_TESTE;

const ANA = { tipoRegistro: 'CRM' as TipoRegistro, registro: '12345-RS' };
const BRUNO = { tipoRegistro: 'COREN' as TipoRegistro, registro: '543210-RS' };

interface AparelhoReal {
  nucleo: Nucleo;
  arquivos: { nome: string; conteudo: Uint8Array }[];
  fechar(): Promise<void>;
}

const abertos: AparelhoReal[] = [];
afterEach(async () => {
  while (abertos.length) await abertos.pop()?.fechar();
});

async function aparelho(nome: string): Promise<AparelhoReal> {
  const pasta = mkdtempSync(join(tmpdir(), 'medicalfield-integracao-'));
  const arquivos: AparelhoReal['arquivos'] = [];
  const nucleo = new Nucleo({
    caminhoDoBanco: join(pasta, 'medicalfield.db'),
    perfil: 'integracao',
    versao: '1.0.0-integracao',
    cofre: cofreFalso,
    salvarArquivo: async (arquivo, conteudo) => {
      arquivos.push({ nome: arquivo, conteudo });
      return join(pasta, arquivo);
    },
  });
  await nucleo.configurar({ servidorUrl: URL_DO_SERVIDOR ?? '', dispositivoNome: nome });
  nucleo.iniciar();
  const a: AparelhoReal = {
    nucleo,
    arquivos,
    async fechar() {
      await nucleo.encerrar();
      rmSync(pasta, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
  abertos.push(a);
  return a;
}

/** Login online e o primeiro "receber dados" (catálogo de medicamentos, pessoas...). */
async function entrarOnline(a: AparelhoReal, quem: typeof ANA) {
  const resultado = await a.nucleo.entrar({ ...quem, senha: SENHA });
  expect(resultado.modo).toBe('ONLINE');
  await a.nucleo.motor.sincronizar('COMPLETO');
}

/** Espera a fila esvaziar (com a chave em Online). */
async function sincronizar(a: AparelhoReal, tipo: 'ENVIO' | 'COMPLETO' = 'COMPLETO') {
  await a.nucleo.motor.sincronizar(tipo);
  const estado = await a.nucleo.estado();
  expect(estado.servidorAcessivel).toBe(true);
}

/** CPF novo a cada execução, com os dígitos verificadores certos. */
function cpfAleatorio(): string {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += (d[i] ?? 0) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    d[tamanho] = resto === 10 ? 0 : resto;
  }
  const cpf = d.join('');
  return /^(\d)\1{10}$/.test(cpf) ? cpfAleatorio() : cpf;
}

async function atendimento(a: AparelhoReal, queixa: string): Promise<DadosAtendimento> {
  const [medicamento] = await a.nucleo.medicamentosAtivos();
  expect(medicamento, 'o catálogo de medicamentos chegou no "receber dados"').toBeDefined();
  const agora = Date.now();
  return {
    dataHora: new Date(agora - 5 * 60_000).toISOString(),
    localOcorrencia: 'BR-386, km 350, Lajeado',
    tipoOcorrencia: 'TRAUMA',
    queixaPrincipal: queixa,
    triagem: { protocolo: 'MANCHESTER', cor: 'AMARELO' },
    glasgow: { ocular: 4, verbal: 5, motora: 6 },
    sinaisVitais: { paSistolica: 130, paDiastolica: 85, frequenciaCardiaca: 98, spo2: 97, temperatura: 36.6 },
    medicamentos: [
      {
        medicamentoId: medicamento?.id ?? '',
        dose: 1,
        unidade: medicamento?.unidadePadrao ?? 'MG',
        via: 'INTRAVENOSA',
        horario: new Date(agora - 2 * 60_000).toISOString(),
      },
    ],
    procedimentos: 'Imobilização e acesso venoso',
    desfecho: { tipo: 'ENCAMINHADO_HOSPITAL', destino: 'Hospital Bruno Born' },
  };
}

const statusDaFila = async (a: AparelhoReal) => (await a.nucleo.fila()).map((i) => [i.tipo, i.status]).reverse();
const tudoConcluido = async (a: AparelhoReal) => (await a.nucleo.fila()).every((i) => i.status === 'CONCLUIDO');

describe.skipIf(!URL_DO_SERVIDOR || !SENHA)(`integração com o servidor real (${URL_DO_SERVIDOR ?? 'sem MEDICALFIELD_URL'})`, () => {
  it('roteiro do enunciado, lado do cliente (docs/11, seção 11.3: passos 5 a 7 e 11 a 17)', async () => {
    const a = await aparelho('Ambulância 01 (integração)');

    // 5 e 6: login online e "receber dados"
    await entrarOnline(a, ANA);
    const depoisDoLogin = await a.nucleo.estado();
    expect(depoisDoLogin.sessao?.profissional.nome).toBe('Dra. Ana Souza');
    expect(depoisDoLogin.ultimaSincronizacaoEm).not.toBeNull();
    expect((await a.nucleo.medicamentosAtivos()).length).toBeGreaterThan(0);

    // 7: atendimento online sai na hora e volta como Sincronizado
    const online = await a.nucleo.criarPessoa({ nome: 'Integração Online', cpf: cpfAleatorio() });
    const prontuarioOnline = await a.nucleo.criarProntuario(online.id, { tipoSanguineo: 'A+' });
    const atendimentoOnline = await a.nucleo.criarAtendimento(prontuarioOnline.id, await atendimento(a, 'Dor torácica'));
    await sincronizar(a, 'ENVIO');
    expect(await tudoConcluido(a)).toBe(true);
    const detalheOnline = await a.nucleo.atendimento(atendimentoOnline.id);
    expect(detalheOnline?.estadoSync).toBe('SINCRONIZADO');
    expect(detalheOnline?.origem.modo).toBe('ONLINE');

    // 12 e 13: offline, pessoa nova, prontuário e atendimento: 3 pendentes, nada sai do aparelho
    await a.nucleo.mudarConectividade('OFFLINE');
    const maria = await a.nucleo.criarPessoa({ nome: 'Integração Offline', cpf: cpfAleatorio(), telefone: '51911110000' });
    const prontuario = await a.nucleo.criarProntuario(maria.id, { alergias: 'Dipirona' });
    const offline = await a.nucleo.criarAtendimento(prontuario.id, await atendimento(a, 'Queda de bicicleta'));
    expect((await a.nucleo.estado()).pendentes).toBe(3);
    expect(await statusDaFila(a)).toEqual(
      expect.arrayContaining([
        ['CRIAR_PESSOA', 'PENDENTE'],
        ['CRIAR_PRONTUARIO', 'PENDENTE'],
        ['CRIAR_ATENDIMENTO', 'PENDENTE'],
      ]),
    );

    // 17, feito offline: o pedido de e-mail também espera na fila
    const pedido = EMAIL_TESTE ? await a.nucleo.pedirEmail(offline.id, { tipo: 'OUTRO', email: EMAIL_TESTE }) : null;

    // 14 e 15: chave em Online, a fila esvazia sozinha (Observer); o servidor guarda o modo Offline
    await a.nucleo.mudarConectividade('ONLINE');
    await sincronizar(a);
    expect((await a.nucleo.estado()).pendentes).toBe(0);
    expect(await tudoConcluido(a)).toBe(true);
    const detalhe = await a.nucleo.atendimento(offline.id);
    expect(detalhe?.estadoSync).toBe('SINCRONIZADO');
    expect(detalhe?.origem.modo).toBe('OFFLINE');
    expect(detalhe?.glasgow?.total).toBe(15);
    expect(detalhe?.medicamentos[0]?.nome).not.toBe('');
    expect(Date.parse(detalhe?.sincronizacao?.recebidoEm ?? '')).toBeGreaterThan(Date.parse(detalhe?.origem.criadoEm ?? ''));

    // 16: o PDF (gerado no servidor) só depois de sincronizado
    const pdf = await a.nucleo.baixarPdf(offline.id);
    expect(pdf?.salvoEm).toMatch(/ficha-atendimento-[0-9A-F]{8}\.pdf$/);
    expect(new TextDecoder().decode(a.arquivos[0]?.conteudo.subarray(0, 5))).toBe('%PDF-');

    // 17: o e-mail saiu, com a resposta do ms-docs guardada no aparelho
    if (pedido) {
      const [enviado] = (await a.nucleo.atendimento(offline.id))?.emails ?? [];
      expect(enviado?.id).toBe(pedido.id);
      expect(enviado?.status).toBe('CONCLUIDO');
      expect(enviado?.resultado?.status).toBe('ENVIADO');
      expect(enviado?.resultado?.destinatarioEmail).toBe(EMAIL_TESTE);
    }

    // Os logs do aparelho subiram junto (docs/08, seção 8.10)
    const logs = await a.nucleo.logsLocais();
    for (const acao of ['LOGIN_ONLINE', 'PESSOA_CRIADA', 'ATENDIMENTO_CRIADO', 'CONECTIVIDADE_ALTERADA']) {
      expect(logs.find((l) => l.acao === acao)?.enviadoEm, acao).not.toBeNull();
    }
  });

  it('o mesmo paciente em duas ambulâncias: o servidor unifica (docs/11, seção 11.4)', async () => {
    const um = await aparelho('Ambulância 01 (integração)');
    const dois = await aparelho('Ambulância 02 (integração)');
    await entrarOnline(um, ANA);
    await entrarOnline(dois, BRUNO);
    await um.nucleo.mudarConectividade('OFFLINE');
    await dois.nucleo.mudarConectividade('OFFLINE');
    const cpf = cpfAleatorio();

    // A3: a Ambulância 01 atende primeiro
    const pessoa1 = await um.nucleo.criarPessoa({ nome: 'Integração Conflito', cpf, telefone: '51911110000' });
    const prontuario1 = await um.nucleo.criarProntuario(pessoa1.id, { alergias: 'Dipirona' });
    await um.nucleo.criarAtendimento(prontuario1.id, await atendimento(um, 'Atendido pela 01'));
    await new Promise((r) => setTimeout(r, 50));
    // A4: depois, a 02 atende a mesma pessoa, com dados diferentes
    const pessoa2 = await dois.nucleo.criarPessoa({ nome: 'Integração Conflito', cpf, telefone: '51922220000', email: 'conflito@exemplo.com' });
    const prontuario2 = await dois.nucleo.criarProntuario(pessoa2.id, { alergias: 'Penicilina', tipoSanguineo: 'O+' });
    const atendimento2 = await dois.nucleo.criarAtendimento(prontuario2.id, await atendimento(dois, 'Atendido pela 02'));

    // A5: a 01 sincroniza normalmente
    await um.nucleo.mudarConectividade('ONLINE');
    await sincronizar(um);
    expect(await tudoConcluido(um)).toBe(true);

    // A6: a 02 sincroniza; pessoa e prontuário unificados, atendimento criado no prontuário que ficou
    await dois.nucleo.mudarConectividade('ONLINE');
    await sincronizar(dois);
    expect(await tudoConcluido(dois)).toBe(true);
    const unificacoes = (await dois.nucleo.logsLocais()).filter((l) => l.acao === 'REGISTRO_UNIFICADO');
    expect(unificacoes.map((l) => l.detalhes?.entidade).sort()).toEqual(['PESSOA', 'PRONTUARIO']);
    const naDois = await dois.nucleo.buscarPessoas(cpf);
    expect(naDois.map((p) => p.id)).toEqual([pessoa1.id]);
    expect((await dois.nucleo.atendimento(atendimento2.id))?.prontuario.id).toBe(prontuario1.id);

    // A7 e A8: na 01, depois de receber os dados, os valores unificados (o mais recente vence) e os 2 atendimentos
    await sincronizar(um);
    const paciente = await um.nucleo.paciente(pessoa1.id);
    expect(paciente?.pessoa.telefone).toBe('51922220000');
    expect(paciente?.pessoa.email).toBe('conflito@exemplo.com');
    expect(paciente?.prontuarios.map((p) => [p.id, p.alergias, p.tipoSanguineo])).toEqual([[prontuario1.id, 'Penicilina', 'O+']]);
    expect(paciente?.atendimentos).toHaveLength(2);
  });

  it('login offline e, com a chave em Online, o login online sozinho (docs/11, seção 11.5)', async () => {
    const a = await aparelho('Ambulância 01 (integração)');
    await entrarOnline(a, ANA);
    const pessoa = await a.nucleo.criarPessoa({ nome: 'Integração Login Offline' });
    const prontuario = await a.nucleo.criarProntuario(pessoa.id, {});
    await sincronizar(a, 'ENVIO');

    // B2: sair e entrar com a chave em Offline
    await a.nucleo.sair();
    await a.nucleo.mudarConectividade('OFFLINE');
    await expect(a.nucleo.entrar({ ...ANA, senha: `${SENHA}x` })).rejects.toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS' });
    expect((await a.nucleo.entrar({ ...ANA, senha: SENHA })).modo).toBe('OFFLINE');

    // B5: registrar offline e voltar para Online: o app entra online sozinho e sincroniza
    const registrado = await a.nucleo.criarAtendimento(prontuario.id, await atendimento(a, 'Registrado depois do login offline'));
    await a.nucleo.mudarConectividade('ONLINE');
    await sincronizar(a);
    expect((await a.nucleo.atendimento(registrado.id))?.estadoSync).toBe('SINCRONIZADO');
    expect((await a.nucleo.estado()).sessao?.precisaLoginOnline).toBe(false);
  });
});
