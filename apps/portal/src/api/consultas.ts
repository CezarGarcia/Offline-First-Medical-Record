import { QueryClient, keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type {
  AtendimentoDetalhe,
  AtendimentoResumo,
  Atendimento,
  Conflito,
  EnvioEmail,
  LogAcesso,
  LogCliente,
  Medicamento,
  Pagina,
  Pessoa,
  Profissional,
  ProntuarioComPessoa,
  ProntuarioDaLista,
} from '@compartilhado/tipos';
import { api } from './cliente';
import { ErroDeRede } from './erros';

export function criarClienteDeConsultas(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Os dados mudam por fora (sincronização dos clientes, SQL direto no banco): sempre busca de novo
        // ao abrir a página (docs/10, seção 10.2)
        staleTime: 0,
        refetchOnWindowFocus: false,
        // Só tenta de novo quando a rede falhou; erro da API (403, 404...) não muda tentando de novo
        retry: (falhas, erro) => erro instanceof ErroDeRede && falhas < 2,
      },
    },
  });
}

// ---------------------------------------------------------------- ms-clinico

export const useAtendimentos = () =>
  useQuery({ queryKey: ['atendimentos'], queryFn: () => api.json<AtendimentoResumo[]>('/atendimento') });

export const useAtendimento = (id: string) =>
  useQuery({
    queryKey: ['atendimento', id],
    queryFn: () => api.json<AtendimentoDetalhe>(`/atendimento/detalhe/${encodeURIComponent(id)}`),
  });

export const useAtendimentosDaPessoa = (pessoaId: string) =>
  useQuery({
    queryKey: ['atendimentos-da-pessoa', pessoaId],
    queryFn: () => api.json<Atendimento[]>(`/atendimento/${encodeURIComponent(pessoaId)}`),
  });

export const useProntuarios = () =>
  useQuery({ queryKey: ['prontuarios'], queryFn: () => api.json<ProntuarioDaLista[]>('/prontuario') });

export const useProntuarioDaPessoa = (pessoaId: string) =>
  useQuery({
    queryKey: ['prontuario', pessoaId],
    queryFn: () => api.json<ProntuarioComPessoa>(`/prontuario/${encodeURIComponent(pessoaId)}`),
  });

export const usePessoas = () => useQuery({ queryKey: ['pessoas'], queryFn: () => api.json<Pessoa[]>('/pessoa') });

export const useMedicamentos = () =>
  useQuery({ queryKey: ['medicamentos'], queryFn: () => api.json<Medicamento[]>('/medicamento') });

export const useConflitos = () =>
  useQuery({ queryKey: ['conflitos'], queryFn: () => api.json<Conflito[]>('/conflito') });

// ---------------------------------------------------------------- ms-auth

export const useProfissionais = () =>
  useQuery({ queryKey: ['profissionais'], queryFn: () => api.json<Profissional[]>('/profissional') });

/** Nome de cada profissional pelo ID, para mostrar nos logs, conflitos e e-mails. */
export function useNomesDosProfissionais(): Map<string, string> {
  const { data } = useProfissionais();
  return useMemo(() => new Map((data ?? []).map((p) => [p.id, p.nome])), [data]);
}

export interface FiltroLogAcesso {
  servico?: string | null;
  profissionalId?: string | null;
  metodo?: string | null;
  status?: number | null;
  rota?: string | null;
  de?: string | null;
  ate?: string | null;
  pagina: number;
  tamanho: number;
}

export const useLogsDeAcesso = (filtro: FiltroLogAcesso) =>
  useQuery({
    queryKey: ['logs-acesso', filtro],
    queryFn: () => api.json<Pagina<LogAcesso>>('/log/acesso', { consulta: { ...filtro } }),
    placeholderData: keepPreviousData,
  });

export interface FiltroLogCliente {
  profissionalId?: string | null;
  dispositivoId?: string | null;
  acao?: string | null;
  modo?: string | null;
  de?: string | null;
  ate?: string | null;
  pagina: number;
  tamanho: number;
}

export const useLogsDosClientes = (filtro: FiltroLogCliente) =>
  useQuery({
    queryKey: ['logs-cliente', filtro],
    queryFn: () => api.json<Pagina<LogCliente>>('/log/cliente', { consulta: { ...filtro } }),
    placeholderData: keepPreviousData,
  });

// ---------------------------------------------------------------- ms-docs

export interface FiltroEnvios {
  atendimentoId?: string | null;
  pagina: number;
  tamanho: number;
}

export const useEnviosDeEmail = (filtro: FiltroEnvios) =>
  useQuery({
    queryKey: ['envios-email', filtro],
    queryFn: () => api.json<Pagina<EnvioEmail>>('/documentos/email', { consulta: { ...filtro } }),
    placeholderData: keepPreviousData,
  });

export const useEspecificacao = (servico: 'ms-auth' | 'ms-clinico' | 'ms-docs') =>
  useQuery({
    queryKey: ['especificacao', servico],
    queryFn: () => api.json<Record<string, unknown>>(`/docs/${servico}`),
    staleTime: 5 * 60_000,
  });
