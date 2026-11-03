import type { QueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSessao } from '../api/sessao';

/** Sem sessão de administrador, vai para o login (e volta para a mesma página depois). */
export function RotaProtegida({ consultas, children }: { consultas: QueryClient; children: ReactNode }) {
  const sessao = useSessao();
  const local = useLocation();

  useEffect(() => {
    // Quando a sessão acaba, nada do que foi carregado fica guardado na memória do navegador
    if (!sessao) consultas.clear();
  }, [sessao, consultas]);

  if (!sessao || sessao.profissional.perfil !== 'ADMIN') {
    return <Navigate to="/login" replace state={{ voltarPara: local.pathname + local.search }} />;
  }
  return children;
}
