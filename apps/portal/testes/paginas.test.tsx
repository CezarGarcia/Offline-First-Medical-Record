import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { eUuid } from '@compartilhado/ids';
import { ApiFalsa, ATENDIMENTO, entrarComoAdmin, erro, json, renderizarPortal, resumo } from './ambiente';

const OUTRO = {
  ...resumo(ATENDIMENTO),
  id: '0193f000-0000-7000-8000-000000000302',
  dataHora: '2026-10-30T09:10:00Z',
  pessoa: { id: '0193f000-0000-7000-8000-000000000102', nome: 'Ana Beatriz Costa', cpf: '11144477735' },
  triagem: { protocolo: 'START' as const, cor: 'VERMELHO' as const },
};

describe('Atendimentos', () => {
  it('lista com a cor da triagem e filtra por paciente', async () => {
    entrarComoAdmin();
    new ApiFalsa().em('GET /api/atendimento', json(200, [resumo(ATENDIMENTO), OUTRO])).instalar();
    renderizarPortal('/atendimentos');

    // O painel do topo (indicadores, casos graves) também mostra nomes e cores: a verificação é na tabela
    const tabela = await screen.findByRole('grid', { name: 'Atendimentos' });
    expect(within(tabela).getByText('João da Silva')).toBeInTheDocument();
    expect(within(tabela).getByText('Ana Beatriz Costa')).toBeInTheDocument();
    expect(within(tabela).getByText('Laranja')).toBeInTheDocument();
    expect(within(tabela).getByText('Vermelho')).toBeInTheDocument();
    expect(within(tabela).getAllByText('28/10/2026 11:20')).not.toHaveLength(0);
    expect(screen.getByText('Casos graves recentes')).toBeInTheDocument();

    await userEvent.setup().type(screen.getByPlaceholderText('Nome ou CPF'), 'joao');
    await waitFor(() => expect(within(tabela).queryByText('Ana Beatriz Costa')).not.toBeInTheDocument());
    expect(within(tabela).getByText('João da Silva')).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('mostra a mensagem da API quando dá erro', async () => {
    entrarComoAdmin();
    new ApiFalsa().em('GET /api/atendimento', erro(503, 'SERVICO_INDISPONIVEL', 'O serviço está fora do ar.')).instalar();
    renderizarPortal('/atendimentos');
    expect(await screen.findByText('O serviço está fora do ar.')).toBeInTheDocument();
  });
});

describe('Detalhe do atendimento', () => {
  function apiDoDetalhe() {
    return new ApiFalsa()
      .em('GET /api/atendimento/detalhe/:id', json(200, ATENDIMENTO))
      .em('GET /api/profissional', json(200, []))
      .instalar();
  }

  it('mostra a ficha completa, como no PDF', async () => {
    entrarComoAdmin();
    apiDoDetalhe();
    renderizarPortal(`/atendimentos/${ATENDIMENTO.id}`);

    expect(await screen.findByText('529.982.247-25')).toBeInTheDocument();
    for (const texto of [
      'Ficha Nº 00000301',
      '10/05/1980 (46 anos)',
      'Dipirona',
      'Muito urgente · até 10 min',
      'Obedece a comandos',
      '150 × 95 mmHg',
      '36,6 °C',
      'Ácido acetilsalicílico (AAS)',
      '200 mg',
      'Hospital Regional',
      'Dra. Ana Souza (CRM 12345-RS)',
      'Offline',
    ]) {
      expect(screen.getAllByText(texto).length, texto).toBeGreaterThan(0);
    }
  });

  it('baixa o PDF com o token e o nome que o servidor mandou', async () => {
    entrarComoAdmin();
    const api = apiDoDetalhe().em(
      'GET /api/documentos/ficha/:id/pdf',
      () =>
        new Response('%PDF-1.7', {
          status: 200,
          headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="ficha-atendimento-00000301.pdf"' },
        }),
    );
    const criarEndereco = vi.fn(() => 'blob:ficha');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: criarEndereco, revokeObjectURL: vi.fn() }));
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('ficha-atendimento-00000301.pdf');
      expect(this.href).toBe('blob:ficha');
    });
    renderizarPortal(`/atendimentos/${ATENDIMENTO.id}`);

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Baixar PDF' }));
    await waitFor(() => expect(clique).toHaveBeenCalledTimes(1));
    expect(api.chamadasPara('GET', `/api/documentos/ficha/${ATENDIMENTO.id}/pdf`)[0]?.cabecalhos.authorization).toBe(
      'Bearer token-admin',
    );
  });

  it('envia por e-mail reaproveitando o mesmo ID do pedido em cada tentativa', async () => {
    entrarComoAdmin();
    let tentativas = 0;
    const api = apiDoDetalhe().em('POST /api/documentos/ficha/:id/email', (chamada) =>
      ++tentativas === 1
        ? erro(502, 'FALHA_ENVIO_EMAIL', 'Não foi possível enviar o e-mail: o servidor de e-mail não respondeu.')
        : json(201, {
            id: (chamada.corpo as { id: string }).id,
            atendimentoId: ATENDIMENTO.id,
            status: 'ENVIADO',
            destinatarioTipo: 'OUTRO',
            destinatarioEmail: 'hospital@exemplo.com',
            erro: null,
            tentativas: 2,
          }),
    );
    renderizarPortal(`/atendimentos/${ATENDIMENTO.id}`);
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Enviar por e-mail' }));
    const janela = await screen.findByRole('dialog');

    // O familiar não tem e-mail no cadastro: a opção fica desabilitada
    expect(within(janela).getByRole('radio', { name: /Familiar/ })).toBeDisabled();
    expect(within(janela).getByRole('radio', { name: /Paciente/ })).toBeEnabled();

    await usuario.click(within(janela).getByRole('radio', { name: /Outro endereço/ }));
    const campo = within(janela).getByRole('textbox', { name: 'E-mail' });
    await usuario.type(campo, 'invalido');
    expect(within(janela).getByRole('button', { name: 'Enviar' })).toBeDisabled();
    await usuario.clear(campo);
    await usuario.type(campo, 'hospital@exemplo.com');
    await usuario.click(within(janela).getByRole('button', { name: 'Enviar' }));

    expect(await within(janela).findByRole('alert')).toHaveTextContent('o servidor de e-mail não respondeu');
    await usuario.click(within(janela).getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Ficha enviada para hospital@exemplo.com.')).toBeInTheDocument();

    const pedidos = api.chamadasPara('POST', `/api/documentos/ficha/${ATENDIMENTO.id}/email`).map((c) => c.corpo as { id: string });
    expect(pedidos).toHaveLength(2);
    expect(eUuid(pedidos[0]?.id ?? '')).toBe(true);
    expect(pedidos[1]?.id).toBe(pedidos[0]?.id);
    expect(pedidos[0]).toMatchObject({ destinatario: { tipo: 'OUTRO', email: 'hospital@exemplo.com' } });
  });
});

describe('Navegação', () => {
  it('rota desconhecida mostra "Página não encontrada" e o botão Sair encerra a sessão', async () => {
    entrarComoAdmin();
    const api = new ApiFalsa().em('POST /api/auth/logout', json(204, null)).instalar();
    renderizarPortal('/nao-existe');
    expect(await screen.findByText('Página não encontrada')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(api.chamadasPara('POST', '/api/auth/logout')).toHaveLength(1);
  });
});
