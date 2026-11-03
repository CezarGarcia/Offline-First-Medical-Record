import { useEffect, useState } from 'react';

/** O valor só muda depois de `ms` sem alterações (para não buscar a cada tecla digitada). */
export function useAtrasado<T>(valor: T, ms = 400): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const espera = window.setTimeout(() => setAtrasado(valor), ms);
    return () => window.clearTimeout(espera);
  }, [valor, ms]);
  return atrasado;
}
