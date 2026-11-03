/**
 * Para os testes de tela: o que o jsdom não tem (o Mantine usa) e uma ponte falsa no lugar do preload do
 * Electron. A ponte chama um núcleo de verdade (SQLite numa pasta temporária, servidor falso), com a mesma
 * cópia estruturada do IPC. Precisa ser importado antes das telas: elas leem `window.medicalfield` ao carregar.
 */
import '@testing-library/jest-dom/vitest';
import type { EventoDoNucleo, MetodoDoNucleo, PonteDoNucleo, RespostaDoNucleo } from '../../src/comum/contrato';
import { serializarErro } from '../../src/main/nucleo/erros';
import type { Nucleo } from '../../src/main/nucleo/nucleo';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (consulta: string) => ({
    matches: false,
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

class ObservadorDeTamanho {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ObservadorDeTamanho as unknown as typeof ResizeObserver;
window.HTMLElement.prototype.scrollIntoView = () => {};
// O Textarea com altura automática do Mantine espera as fontes carregarem
Object.defineProperty(document, 'fonts', { value: { addEventListener() {}, removeEventListener() {} }, configurable: true });

class PonteFalsa implements PonteDoNucleo {
  /** O núcleo do teste em andamento. */
  alvo: Nucleo | null = null;
  private readonly ouvintes = new Set<(evento: EventoDoNucleo) => void>();

  chamar = async (metodo: MetodoDoNucleo, argumentos: unknown[]): Promise<RespostaDoNucleo<unknown>> => {
    if (!this.alvo) return { ok: false, erro: { codigo: 'SEM_NUCLEO', mensagem: 'Nenhum núcleo no teste.' } };
    try {
      const funcao = this.alvo[metodo] as (...a: unknown[]) => Promise<unknown>;
      return { ok: true, valor: structuredClone(await funcao.apply(this.alvo, argumentos)) };
    } catch (erro) {
      return { ok: false, erro: serializarErro(erro) };
    }
  };

  aoAvisar = (ouvinte: (evento: EventoDoNucleo) => void): (() => void) => {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  };

  avisar = (evento: EventoDoNucleo): void => {
    for (const ouvinte of this.ouvintes) ouvinte(structuredClone(evento));
  };
}

export const ponte = new PonteFalsa();
window.medicalfield = ponte;
