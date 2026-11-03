/**
 * As telas falam com o núcleo local só por aqui (window.medicalfield, criado pelo preload). Cada método do
 * contrato vira uma função assíncrona; um erro do núcleo vira um ErroDoApp com o código e a mensagem.
 */
import { useSyncExternalStore } from 'react';
import type { ProblemaDeCampo } from '@compartilhado/validacao';
import {
  type ApiDoNucleo,
  type EstadoDoApp,
  type EventoDoNucleo,
  METODOS_DO_NUCLEO,
  type MetodoDoNucleo,
  type PonteDoNucleo,
} from '../../comum/contrato';

declare global {
  interface Window {
    medicalfield: PonteDoNucleo;
  }
}

export class ErroDoApp extends Error {
  constructor(
    readonly codigo: string,
    mensagem: string,
    readonly detalhes: ProblemaDeCampo[] = [],
    readonly bloqueadoAte?: string,
  ) {
    super(mensagem);
    this.name = 'ErroDoApp';
  }
}

function criarCliente(): ApiDoNucleo {
  const cliente: Record<string, (...argumentos: unknown[]) => Promise<unknown>> = {};
  for (const metodo of METODOS_DO_NUCLEO) {
    cliente[metodo] = async (...argumentos: unknown[]) => {
      const resposta = await window.medicalfield.chamar(metodo as MetodoDoNucleo, argumentos);
      if (resposta.ok) return resposta.valor;
      const { codigo, mensagem, detalhes, bloqueadoAte } = resposta.erro;
      throw new ErroDoApp(codigo, mensagem, detalhes ?? [], bloqueadoAte);
    };
  }
  return cliente as unknown as ApiDoNucleo;
}

export const nucleo = criarCliente();

export function mensagemDoErro(erro: unknown): string {
  if (erro instanceof ErroDoApp && erro.codigo === 'VALIDACAO' && erro.detalhes.length) {
    return `${erro.message} Confira os campos marcados.`;
  }
  return erro instanceof Error ? erro.message : 'Erro inesperado.';
}

/** "cpf" → "CPF inválido", para mostrar embaixo de cada campo do formulário. */
export function errosPorCampo(erro: unknown): Record<string, string> {
  if (!(erro instanceof ErroDoApp)) return {};
  return Object.fromEntries(erro.detalhes.map((d) => [d.campo, d.mensagem]));
}

// ---------------------------------------------------------------- estado do app (chave, sessão, fila)

type Ouvinte = () => void;

class EstadoCompartilhado {
  private atual: EstadoDoApp | null = null;
  private readonly ouvintes = new Set<Ouvinte>();
  private readonly ouvintesDeDados = new Set<Ouvinte>();

  constructor() {
    window.medicalfield.aoAvisar((evento: EventoDoNucleo) => {
      if (evento.tipo === 'estado') {
        this.atual = evento.estado;
        for (const o of this.ouvintes) o();
      } else {
        for (const o of this.ouvintesDeDados) o();
      }
    });
    // Sem resposta agora (o núcleo ainda abrindo): o próximo aviso de estado traz tudo
    this.recarregar().catch((erro: unknown) => console.error('[telas] estado inicial', erro));
  }

  async recarregar(): Promise<void> {
    this.atual = await nucleo.estado();
    for (const o of this.ouvintes) o();
  }

  ler = (): EstadoDoApp | null => this.atual;

  assinar = (ouvinte: Ouvinte): (() => void) => {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  };

  /** Algo foi salvo ou sincronizado: as listas buscam de novo. */
  aoMudarDados(ouvinte: Ouvinte): () => void {
    this.ouvintesDeDados.add(ouvinte);
    return () => this.ouvintesDeDados.delete(ouvinte);
  }
}

export const estadoDoApp = new EstadoCompartilhado();

export function useEstadoDoApp(): EstadoDoApp | null {
  return useSyncExternalStore(estadoDoApp.assinar, estadoDoApp.ler);
}
