/**
 * As telas do app cliente com o núcleo de verdade por trás (só o Electron e o servidor são falsos): os fluxos
 * da apresentação (docs/10, seção 10.1, e docs/11). O passeio no Electron real fica em e2e/passeio.mjs.
 */
import { ponte } from './ponte';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Nucleo } from '../../src/main/nucleo/nucleo';
import { App } from '../../src/renderer/src/App';
import { estadoDoApp } from '../../src/renderer/src/nucleo';
import { SENHA, SERVIDOR, ServidorFalso, atendimentoBasico, cofreFalso, json } from '../servidor-falso';

interface Montado {
  nucleo: Nucleo;
  servidor: ServidorFalso;
  usuario: ReturnType<typeof userEvent.setup>;
}

const abertos: { nucleo: Nucleo; pasta: string }[] = [];
afterEach(async () => {
  cleanup();
  ponte.alvo = null;
  while (abertos.length) {
    const { nucleo, pasta } = abertos.pop()!;
    await nucleo.encerrar();
    rmSync(pasta, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

/** Um aparelho novo, com o app montado na tela inicial. */
async function montar({ configurado = true, logado = true, servidor = new ServidorFalso() } = {}): Promise<Montado> {
  const pasta = mkdtempSync(join(tmpdir(), 'medicalfield-telas-'));
  const nucleo = new Nucleo({
    caminhoDoBanco: join(pasta, 'medicalfield.db'),
    perfil: 'telas',
    versao: '1.0.0-teste',
    cofre: cofreFalso,
    buscar: servidor.buscar as typeof fetch,
    salvarArquivo: async (nome) => join(pasta, nome),
    aoAvisar: ponte.avisar,
  });
  abertos.push({ nucleo, pasta });
  if (configurado) await nucleo.configurar({ servidorUrl: SERVIDOR, dispositivoNome: 'Ambulância Teste' });
  nucleo.iniciar();
  if (logado) {
    await nucleo.entrar({ tipoRegistro: 'CRM', registro: '12345-RS', senha: SENHA });
    await nucleo.motor.sincronizar('COMPLETO');
  }
  ponte.alvo = nucleo;
  await estadoDoApp.recarregar();
  window.location.hash = '#/';
  render(<App ambiente="test" />);
  return { nucleo, servidor, usuario: userEvent.setup() };
}

const barra = () => screen.getByRole('banner');

async function escolher(usuario: Montado['usuario'], campo: HTMLElement, opcao: string | RegExp) {
  await usuario.click(campo);
  await usuario.click(await screen.findByRole('option', { name: opcao }));
}

async function mudarChave(usuario: Montado['usuario'], modo: 'Online' | 'Offline') {
  const chave = screen.getAllByRole('radiogroup', { name: 'Simular conectividade' })[0]!;
  await usuario.click(within(chave).getByText(modo));
}

/** Pessoa, prontuário e atendimento pelo núcleo (para as telas que mostram um atendimento pronto). */
async function ocorrencia(nucleo: Nucleo, pessoa: Parameters<Nucleo['criarPessoa']>[0] = { nome: 'Maria Oliveira' }) {
  const p = await nucleo.criarPessoa(pessoa);
  const pr = await nucleo.criarProntuario(p.id, { alergias: 'Dipirona' });
  const at = await nucleo.criarAtendimento(pr.id, atendimentoBasico());
  return { pessoa: p, prontuario: pr, atendimento: at };
}

describe('primeira vez e login', () => {
  it('configuração, login online e a moldura do app (barra, chave e menu)', async () => {
    const { usuario } = await montar({ configurado: false, logado: false });
    await usuario.type(await screen.findByLabelText(/Endereço do servidor/), 'servidor.teste');
    await usuario.type(screen.getByLabelText(/Nome deste dispositivo/), 'Ambulância 01');
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }));

    await usuario.type(await screen.findByRole('textbox', { name: /^Registro/ }), '12345-RS');
    await usuario.type(screen.getByLabelText(/^Senha/), SENHA);
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Atendimentos' })).toBeInTheDocument();
    expect(within(barra()).getByText('Ambulância 01')).toBeInTheDocument();
    expect(within(barra()).getByText('Dra. Ana Souza (CRM 12345-RS)')).toBeInTheDocument();
    expect(within(barra()).getByText('0 pendentes')).toBeInTheDocument();
    await waitFor(() => expect(within(barra()).queryByText('nunca')).not.toBeInTheDocument());
    for (const item of ['Nova ocorrência', 'Pacientes', 'Fila de sincronização', 'Logs locais', 'Sobre', 'Sair']) {
      expect(screen.getAllByText(item).length).toBeGreaterThan(0);
    }
  });

  it('offline, o primeiro acesso neste aparelho precisa de conexão', async () => {
    const { usuario, servidor } = await montar({ logado: false });
    await mudarChave(usuario, 'Offline');
    await usuario.type(await screen.findByRole('textbox', { name: /^Registro/ }), '12345-RS');
    await usuario.type(screen.getByLabelText(/^Senha/), SENHA);
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O primeiro acesso neste aparelho precisa de conexão.');
    expect(servidor.chamadas).toHaveLength(0);
  });
});

describe('nova ocorrência (docs/11, passos 12 a 14)', () => {
  it('offline: pessoa, prontuário e atendimento ficam pendentes; em Online, a fila esvazia sozinha', async () => {
    const { usuario, servidor } = await montar();
    await mudarChave(usuario, 'Offline');
    expect(await screen.findByText('Modo offline: tudo está sendo salvo neste aparelho.')).toBeInTheDocument();
    const antes = servidor.chamadas.length;

    await usuario.click(screen.getAllByRole('link', { name: 'Nova ocorrência' })[0]!);
    await usuario.click(await screen.findByRole('button', { name: 'Cadastrar nova pessoa' }));
    await usuario.type(screen.getAllByLabelText(/^Nome/)[0]!, 'Carlos Pereira');
    await usuario.type(screen.getByLabelText('CPF'), '24681357928');
    await usuario.click(screen.getByRole('button', { name: 'Salvar pessoa e continuar' }));

    await usuario.type(await screen.findByLabelText('Alergias'), 'Penicilina');
    await usuario.click(screen.getByRole('button', { name: 'Salvar prontuário e continuar' }));

    // Passo 3: as alergias em destaque, antes de medicar
    expect(await screen.findByRole('button', { name: 'Salvar atendimento' })).toBeInTheDocument();
    expect(screen.getByText('Penicilina')).toBeInTheDocument();
    await escolher(usuario, screen.getByRole('combobox', { name: /Tipo de ocorrência/ }), 'Trauma');
    await usuario.type(screen.getByLabelText(/Queixa principal/), 'Colisão de moto');
    await usuario.click(screen.getByRole('radio', { name: 'Amarelo' }));
    await usuario.click(screen.getByRole('button', { name: 'Adicionar medicamento' }));
    const medicamento = screen.getByRole('group', { name: 'Medicamento 1' });
    await escolher(usuario, within(medicamento).getByRole('combobox', { name: /^Medicamento/ }), /Dipirona/);
    await usuario.type(within(medicamento).getByLabelText(/^Dose/), '1');
    await escolher(usuario, within(medicamento).getByRole('combobox', { name: /^Via/ }), 'Intravenosa');
    await escolher(usuario, screen.getByRole('combobox', { name: /^Desfecho/ }), 'Liberado no local');
    await usuario.click(screen.getByRole('button', { name: 'Salvar atendimento' }));

    expect(await screen.findByRole('heading', { name: /^Ficha Nº/ })).toBeInTheDocument();
    expect(screen.getByText(/Salvo neste aparelho; vai para o servidor/)).toBeInTheDocument();
    expect(within(barra()).getByText('3 pendentes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar PDF' })).toBeDisabled();
    expect(servidor.chamadas).toHaveLength(antes);

    // Passo 14: a chave em Online basta (Observer)
    await mudarChave(usuario, 'Online');
    await waitFor(() => expect(within(barra()).getByText('0 pendentes')).toBeInTheDocument(), { timeout: 5000 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Baixar PDF' })).toBeEnabled());
    expect(servidor.pessoas.size).toBeGreaterThan(0);
    const [atendimento] = [...servidor.atendimentos.values()];
    expect(atendimento?.origem.modo).toBe('OFFLINE');
    expect(atendimento?.medicamentos).toHaveLength(1);
  });

  it('o formulário do atendimento confere antes de salvar e o erro some quando o campo muda', async () => {
    const { usuario, nucleo } = await montar();
    const pessoa = await nucleo.criarPessoa({ nome: 'Paciente Sem Ficha' });
    await nucleo.criarProntuario(pessoa.id, {});
    window.location.hash = `#/nova-ocorrencia?pessoa=${pessoa.id}`;
    await usuario.click(await screen.findByRole('button', { name: 'Usar este prontuário' }));
    await usuario.click(await screen.findByRole('button', { name: 'Salvar atendimento' }));

    expect(await screen.findByText(/^4 campos precisam de atenção/)).toBeInTheDocument();
    expect(screen.getAllByText('campo obrigatório')).toHaveLength(4);
    await usuario.type(screen.getByLabelText(/Queixa principal/), 'Dor');
    expect(screen.getAllByText('campo obrigatório')).toHaveLength(3);
    expect(await nucleo.atendimentos()).toHaveLength(0);
  });
});

describe('fila, e-mail e PDF', () => {
  it('item recusado pelo servidor fica com erro; "Tentar de novo" manda outra vez', async () => {
    const servidor = new ServidorFalso();
    servidor.forcar('POST', /^\/api\/pessoa$/, () => json(422, { erro: 'VALIDACAO', mensagem: 'Dados inválidos.' }));
    const { usuario, nucleo } = await montar({ servidor });
    await nucleo.criarPessoa({ nome: 'Recusada Uma Vez' });
    await nucleo.motor.sincronizar('ENVIO');

    await usuario.click(screen.getByRole('link', { name: 'Fila de sincronização' }));
    expect(await screen.findByText('1 item com erro na fila.')).toBeInTheDocument();
    expect(await screen.findByText('VALIDACAO: Dados inválidos.')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.queryByText('1 item com erro na fila.')).not.toBeInTheDocument(), { timeout: 5000 });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument());
    expect((await nucleo.fila())[0]?.status).toBe('CONCLUIDO');
  });

  it('e-mail: só aparecem os destinatários com e-mail; offline, o pedido vai para a fila', async () => {
    const { usuario, nucleo, servidor } = await montar();
    const { atendimento } = await ocorrencia(nucleo, { nome: 'Sem E-mail', contato: { nome: 'Pedro', email: 'pedro@exemplo.com' } });
    await nucleo.motor.sincronizar('ENVIO');
    await mudarChave(usuario, 'Offline');
    window.location.hash = `#/atendimentos/${atendimento.id}`;
    await usuario.click(await screen.findByRole('button', { name: 'Enviar por e-mail' }));

    const janela = await screen.findByRole('dialog');
    expect(within(janela).queryByLabelText('Paciente')).not.toBeInTheDocument();
    expect(within(janela).getByLabelText('Familiar')).toBeChecked();
    expect(within(janela).getByText('Modo offline: o envio vai para a fila e sai quando a conexão voltar.')).toBeInTheDocument();
    await usuario.click(within(janela).getByRole('button', { name: 'Colocar na fila' }));

    expect(await screen.findByText('E-mails desta ficha')).toBeInTheDocument();
    expect(screen.getByText('aguardando a conexão')).toBeInTheDocument();
    expect(servidor.emails).toHaveLength(0);

    await mudarChave(usuario, 'Online');
    expect(await screen.findByText(/^Enviado em /, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(servidor.emails).toEqual([{ id: expect.any(String), destinatario: { tipo: 'FAMILIAR' } }]);
  });

  it('Baixar PDF fica desabilitado até o atendimento sincronizar', async () => {
    const { usuario, nucleo } = await montar();
    await mudarChave(usuario, 'Offline');
    const { atendimento } = await ocorrencia(nucleo);
    window.location.hash = `#/atendimentos/${atendimento.id}`;
    expect(await screen.findByRole('button', { name: 'Baixar PDF' })).toBeDisabled();
    await mudarChave(usuario, 'Online');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Baixar PDF' })).toBeEnabled(), { timeout: 5000 });
  });
});
