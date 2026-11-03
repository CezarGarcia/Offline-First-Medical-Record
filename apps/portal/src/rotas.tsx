import type { QueryClient } from '@tanstack/react-query';
import { Suspense, lazy } from 'react';
import { RouterProvider as RoteadorDoAria } from 'react-aria-components';
import { Navigate, Outlet, type RouteObject, createBrowserRouter, useHref, useNavigate } from 'react-router';
import { Carregando } from './componentes/Pagina';
import { Layout } from './componentes/Layout';
import { RotaProtegida } from './componentes/RotaProtegida';
import { Atendimentos } from './paginas/Atendimentos';
import { Conflitos } from './paginas/Conflitos';
import { DetalheAtendimento } from './paginas/DetalheAtendimento';
import { DetalheProntuario } from './paginas/DetalheProntuario';
import { Emails } from './paginas/Emails';
import { Login } from './paginas/Login';
import { LogsAcesso } from './paginas/LogsAcesso';
import { LogsClientes } from './paginas/LogsClientes';
import { Medicamentos } from './paginas/Medicamentos';
import { NaoEncontrada } from './paginas/NaoEncontrada';
import { Pessoas } from './paginas/Pessoas';
import { Profissionais } from './paginas/Profissionais';
import { Prontuarios } from './paginas/Prontuarios';

// O Swagger UI é grande: a página da API só é baixada quando alguém abre
const Api = lazy(() => import('./paginas/Api'));

/** Links e linhas clicáveis dos componentes do React Aria navegam pelo React Router, sem recarregar a página. */
function IntegracaoComOAria() {
  const navegar = useNavigate();
  return (
    <RoteadorDoAria navigate={navegar} useHref={useHref}>
      <Outlet />
    </RoteadorDoAria>
  );
}

/** As rotas do portal (os testes usam as mesmas, com um roteador em memória). */
export function rotasDoPortal(consultas: QueryClient): RouteObject[] {
  return [
    {
      element: <IntegracaoComOAria />,
      children: [
        { path: '/login', element: <Login /> },
        {
          element: (
            <RotaProtegida consultas={consultas}>
              <Layout />
            </RotaProtegida>
          ),
          children: [
            { index: true, element: <Navigate to="/atendimentos" replace /> },
            { path: 'atendimentos', element: <Atendimentos /> },
            { path: 'atendimentos/:id', element: <DetalheAtendimento /> },
            { path: 'prontuarios', element: <Prontuarios /> },
            { path: 'prontuarios/:pessoaId', element: <DetalheProntuario /> },
            { path: 'pessoas', element: <Pessoas /> },
            { path: 'medicamentos', element: <Medicamentos /> },
            { path: 'profissionais', element: <Profissionais /> },
            { path: 'conflitos', element: <Conflitos /> },
            { path: 'logs/acesso', element: <LogsAcesso /> },
            { path: 'logs/clientes', element: <LogsClientes /> },
            { path: 'emails', element: <Emails /> },
            {
              // Não é "/api": esse prefixo é da API, no Nginx
              path: 'documentacao',
              element: (
                <Suspense fallback={<Carregando />}>
                  <Api />
                </Suspense>
              ),
            },
            { path: '*', element: <NaoEncontrada /> },
          ],
        },
      ],
    },
  ];
}

export function criarRotas(consultas: QueryClient) {
  return createBrowserRouter(rotasDoPortal(consultas));
}
