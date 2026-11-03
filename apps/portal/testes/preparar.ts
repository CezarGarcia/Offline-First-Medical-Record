import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { armazemDaSessao } from '../src/api/sessao';

afterEach(() => {
  cleanup();
  armazemDaSessao.encerrar(null);
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// O Mantine usa APIs do navegador que o jsdom não tem
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
