/** Ferramentas dos testes: uma API falsa (no lugar do fetch), o portal montado em memória e dados de exemplo. */
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { RouterProvider } from 'react-router/dom';
import { createMemoryRouter } from 'react-router';
import { vi } from 'vitest';
import type { AtendimentoDetalhe, AtendimentoResumo, RespostaLogin } from '@compartilhado/tipos';
import { criarClienteDeConsultas } from '../src/api/consultas';
import { armazemDaSessao } from '../src/api/sessao';
import { rotasDoPortal } from '../src/rotas';
import { tema } from '../src/tema';

// ---------------------------------------------------------------- respostas

export function json(status: number, corpo: unknown, cabecalhos: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json', ...cabecalhos },
  });
}

export const erro = (status: number, codigo: string, mensagem = 'erro', extras: Record<string, unknown> = {}) =>
  json(status, { erro: codigo, mensagem, ...extras });

export interface Chamada {
  metodo: string;
  url: string;
  caminho: string;
  cabecalhos: Record<string, string>;
  corpo: unknown;
}

type Tratador = (chamada: Chamada) => Response | Promise<Response>;

/** Um fetch falso: cada "MÉTODO /caminho" tem a sua resposta; guarda todas as chamadas recebidas. */
export class ApiFalsa {
  readonly chamadas: Chamada[] = [];
  private readonly rotas: [RegExp, Tratador][] = [];

  em(metodoECaminho: string, tratador: Tratador | Response): this {
    const [metodo, caminho] = metodoECaminho.split(' ') as [string, string];
    const padrao = new RegExp(`^${metodo} ${caminho.replace(/:[a-z]+/gi, '[^/?]+')}(\\?.*)?$`);
    this.rotas.unshift([padrao, typeof tratador === 'function' ? tratador : () => tratador.clone()]);
    return this;
  }

  buscar = vi.fn(async (endereco: string | URL | Request, opcoes: RequestInit = {}) => {
    const url = String(endereco);
    const metodo = (opcoes.method ?? 'GET').toUpperCase();
    const chamada: Chamada = {
      metodo,
      url,
      caminho: url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] ?? url,
      cabecalhos: Object.fromEntries(new Headers(opcoes.headers).entries()),
      corpo: typeof opcoes.body === 'string' ? JSON.parse(opcoes.body) : null,
    };
    this.chamadas.push(chamada);
    const achada = this.rotas.find(([padrao]) => padrao.test(`${metodo} ${url.replace(/^https?:\/\/[^/]+/, '')}`));
    if (!achada) return erro(404, 'NAO_ENCONTRADO', `sem resposta falsa para ${metodo} ${url}`);
    return achada[1](chamada);
  });

  /** Coloca esta API no lugar do fetch do navegador. */
  instalar(): this {
    vi.stubGlobal('fetch', this.buscar);
    return this;
  }

  chamadasPara(metodo: string, caminho: string): Chamada[] {
    return this.chamadas.filter((c) => c.metodo === metodo && c.caminho === caminho);
  }
}

// ---------------------------------------------------------------- portal montado

export function renderizarPortal(caminho: string) {
  const consultas = criarClienteDeConsultas();
  const roteador = createMemoryRouter(rotasDoPortal(consultas), { initialEntries: [caminho] });
  const resultado = render(
    <MantineProvider theme={tema}>
      <DatesProvider settings={{ locale: 'pt-br' }}>
        <Notifications />
        <QueryClientProvider client={consultas}>
          <RouterProvider router={roteador} />
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>,
  );
  return { ...resultado, roteador };
}

// ---------------------------------------------------------------- dados

export function respostaDeLogin(perfil: 'ADMIN' | 'OPERACIONAL' = 'ADMIN', minutos = 15): RespostaLogin {
  return {
    tokenDeAcesso: `token-${perfil.toLowerCase()}`,
    tokenDeAcessoExpiraEm: new Date(Date.now() + minutos * 60_000).toISOString(),
    refreshToken: 'refresh-token-de-teste-com-mais-de-vinte-caracteres',
    sessaoExpiraEm: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
    profissional: {
      id: perfil === 'ADMIN' ? '0193f000-0000-7000-8000-0000000000a1' : '0193f000-0000-7000-8000-0000000000b2',
      nome: perfil === 'ADMIN' ? 'Dr. Ricardo Almeida' : 'Enf. Bruno Lima',
      tipoRegistro: perfil === 'ADMIN' ? 'CRM' : 'COREN',
      registro: perfil === 'ADMIN' ? '10001-RS' : '543210-RS',
      perfil,
    },
  };
}

export function entrarComoAdmin(): RespostaLogin {
  const sessao = respostaDeLogin('ADMIN');
  armazemDaSessao.salvar(sessao);
  return sessao;
}

const origem = {
  criadoPorId: '0193f000-0000-7000-8000-0000000000c3',
  criadoPorNome: 'Dra. Ana Souza',
  criadoPorRegistro: 'CRM 12345-RS',
  criadoEm: '2026-10-28T14:40:00Z',
  dispositivoId: '0193f000-0000-7000-8000-00000000a001',
  dispositivoNome: 'Ambulância 01',
  modo: 'OFFLINE' as const,
};
const sincronizacao = {
  sincronizadoPorId: '0193f000-0000-7000-8000-0000000000a1',
  recebidoEm: '2026-10-28T15:02:00Z',
  atualizadoEm: '2026-10-28T15:02:00Z',
};

export const ATENDIMENTO: AtendimentoDetalhe = {
  id: '0193f000-0000-7000-8000-000000000301',
  prontuarioId: '0193f000-0000-7000-8000-000000000201',
  dataHora: '2026-10-28T14:20:00Z',
  localOcorrencia: 'Av. Benjamin Constant, centro de Lajeado',
  tipoOcorrencia: 'CLINICA',
  queixaPrincipal: 'Dor no peito há cerca de uma hora',
  triagem: { protocolo: 'MANCHESTER', cor: 'LARANJA' },
  glasgow: { ocular: 4, verbal: 5, motora: 6, total: 15 },
  sinaisVitais: {
    paSistolica: 150,
    paDiastolica: 95,
    frequenciaCardiaca: 102,
    frequenciaRespiratoria: 20,
    spo2: 95,
    temperatura: 36.6,
    glicemia: 130,
  },
  medicamentos: [
    {
      id: '0193f000-0000-7000-8000-000000000401',
      medicamentoId: '0193f000-0000-7000-8000-000000000501',
      nome: 'Ácido acetilsalicílico (AAS)',
      dose: 200,
      unidade: 'MG',
      via: 'ORAL',
      horario: '2026-10-28T14:28:00Z',
      observacao: 'Mastigar',
    },
  ],
  procedimentos: 'Monitorização cardíaca; oxigênio 2 L/min',
  desfecho: { tipo: 'ENCAMINHADO_HOSPITAL', destino: 'Hospital Regional' },
  observacoes: null,
  origem,
  sincronizacao,
  pessoa: {
    id: '0193f000-0000-7000-8000-000000000101',
    nome: 'João da Silva',
    cpf: '52998224725',
    dataNascimento: '1980-05-10',
    sexo: 'MASCULINO',
    telefone: '51999990000',
    email: 'joao.silva@exemplo.com',
    contato: { nome: 'Maria da Silva', parentesco: 'Esposa', telefone: '51988880000', email: null },
    origem,
    sincronizacao,
  },
  prontuario: {
    id: '0193f000-0000-7000-8000-000000000201',
    pessoaId: '0193f000-0000-7000-8000-000000000101',
    tipoSanguineo: 'O+',
    alergias: 'Dipirona',
    comorbidades: 'Hipertensão',
    medicamentosUsoContinuo: 'Losartana 50 mg',
    observacoes: null,
    origem,
    sincronizacao,
  },
};

export function resumo(atendimento: AtendimentoDetalhe, mudancas: Partial<AtendimentoResumo> = {}): AtendimentoResumo {
  return {
    id: atendimento.id,
    dataHora: atendimento.dataHora,
    pessoa: { id: atendimento.pessoa.id, nome: atendimento.pessoa.nome, cpf: atendimento.pessoa.cpf },
    tipoOcorrencia: atendimento.tipoOcorrencia,
    triagem: atendimento.triagem,
    desfecho: atendimento.desfecho,
    origem: atendimento.origem,
    sincronizacao: atendimento.sincronizacao,
    ...mudancas,
  };
}
