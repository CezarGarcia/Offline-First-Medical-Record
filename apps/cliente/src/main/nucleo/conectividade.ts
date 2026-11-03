import type { Modo } from '@compartilhado/tipos';

type Ouvinte = (modo: Modo, anterior: Modo) => void;

/**
 * A chave "Simular Conectividade (Online / Offline)" do enunciado (docs/07, seção 7.2).
 *
 * Padrão **Observer**: a chave é o sujeito. Quem precisa saber das mudanças se inscreve: o motor de
 * sincronização (ao ir para Online, sincroniza), o cliente HTTP (ao ir para Offline, cancela o que estiver
 * em andamento), a sessão e as telas.
 */
export class EstadoConectividade {
  private readonly ouvintes = new Set<Ouvinte>();

  constructor(private modo: Modo) {}

  get atual(): Modo {
    return this.modo;
  }

  get online(): boolean {
    return this.modo === 'ONLINE';
  }

  mudar(modo: Modo): void {
    if (modo === this.modo) return;
    const anterior = this.modo;
    this.modo = modo;
    for (const ouvinte of [...this.ouvintes]) {
      try {
        ouvinte(modo, anterior);
      } catch (erro) {
        console.error('[conectividade] erro num ouvinte', erro);
      }
    }
  }

  assinar(ouvinte: Ouvinte): () => void {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  }
}
