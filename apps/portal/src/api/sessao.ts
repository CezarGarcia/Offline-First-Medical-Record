import { useSyncExternalStore } from 'react';
import type { RespostaLogin } from '@compartilhado/tipos';

/** O que o portal guarda do login. Fica no sessionStorage: some ao fechar a aba (docs/08, seção 8.3). */
export type Sessao = RespostaLogin;

type Ouvinte = () => void;

export class ArmazemDaSessao {
  private readonly ouvintes = new Set<Ouvinte>();
  private lida = false;
  private sessao: Sessao | null = null;
  /** Por que a última sessão acabou (aparece na tela de login). */
  motivoDoFim: string | null = null;

  constructor(
    private readonly armazenamento: Storage,
    private readonly chave = 'medicalfield.portal.sessao',
  ) {}

  atual = (): Sessao | null => {
    if (!this.lida) {
      this.lida = true;
      this.sessao = this.ler();
    }
    return this.sessao;
  };

  salvar(sessao: Sessao): void {
    this.armazenamento.setItem(this.chave, JSON.stringify(sessao));
    this.sessao = sessao;
    this.lida = true;
    this.motivoDoFim = null;
    this.avisar();
  }

  encerrar(motivo: string | null = null): void {
    this.armazenamento.removeItem(this.chave);
    this.sessao = null;
    this.lida = true;
    this.motivoDoFim = motivo;
    this.avisar();
  }

  assinar = (ouvinte: Ouvinte): (() => void) => {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  };

  private ler(): Sessao | null {
    try {
      const texto = this.armazenamento.getItem(this.chave);
      if (!texto) return null;
      const sessao = JSON.parse(texto) as Sessao;
      // Sessão vencida (7 dias) não volta: o refresh token também não valeria mais
      if (Date.parse(sessao.sessaoExpiraEm) <= Date.now()) {
        this.armazenamento.removeItem(this.chave);
        return null;
      }
      return sessao;
    } catch {
      return null;
    }
  }

  private avisar(): void {
    for (const ouvinte of this.ouvintes) ouvinte();
  }
}

export const armazemDaSessao = new ArmazemDaSessao(window.sessionStorage);

/** A sessão atual; o componente redesenha quando ela muda (login, renovação, saída). */
export function useSessao(armazem: ArmazemDaSessao = armazemDaSessao): Sessao | null {
  return useSyncExternalStore(armazem.assinar, armazem.atual);
}
