import { Center, Loader, MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, createHashRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Estrutura } from './componentes/Estrutura';
import { estadoDoApp, useEstadoDoApp } from './nucleo';
import { Atendimento } from './paginas/Atendimento';
import { Atendimentos } from './paginas/Atendimentos';
import { Configuracao } from './paginas/Configuracao';
import { Fila } from './paginas/Fila';
import { Login } from './paginas/Login';
import { Logs } from './paginas/Logs';
import { NovaOcorrencia } from './paginas/NovaOcorrencia';
import { Paciente } from './paginas/Paciente';
import { Pacientes } from './paginas/Pacientes';
import { Sobre } from './paginas/Sobre';
import { tema } from './tema';

/** Primeira vez: configuração. Sem sessão: login. Com sessão: o app. */
function Portaria() {
  const estado = useEstadoDoApp();
  if (!estado) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!estado.configurado) return <Configuracao />;
  if (!estado.sessao) return <Login />;
  return (
    <Estrutura>
      <Outlet />
    </Estrutura>
  );
}

const rotas = createHashRouter([
  {
    element: <Portaria />,
    children: [
      { index: true, element: <Navigate to="/atendimentos" replace /> },
      { path: 'nova-ocorrencia', element: <NovaOcorrencia /> },
      { path: 'pacientes', element: <Pacientes /> },
      { path: 'pacientes/:id', element: <Paciente /> },
      { path: 'atendimentos', element: <Atendimentos /> },
      { path: 'atendimentos/:id', element: <Atendimento /> },
      { path: 'fila', element: <Fila /> },
      { path: 'logs', element: <Logs /> },
      { path: 'sobre', element: <Sobre /> },
      { path: '*', element: <Navigate to="/atendimentos" replace /> },
    ],
  },
]);

/** `ambiente="test"`: os testes de tela (jsdom) desligam as animações e os portais do Mantine. */
export function App({ ambiente = 'default' }: { ambiente?: 'default' | 'test' }) {
  const [consultas] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 0, retry: false, refetchOnWindowFocus: false } } }),
  );
  // O núcleo avisou que os dados mudaram (algo salvo ou sincronizado): as listas buscam de novo
  useEffect(() => estadoDoApp.aoMudarDados(() => void consultas.invalidateQueries()), [consultas]);
  return (
    <MantineProvider theme={tema} defaultColorScheme="light" env={ambiente}>
      <DatesProvider settings={{ locale: 'pt-br', firstDayOfWeek: 0 }}>
        {/* Embaixo: em cima, os avisos cobririam a chave Online/Offline e o botão Sincronizar */}
        <Notifications position="bottom-right" />
        <QueryClientProvider client={consultas}>
          <RouterProvider router={rotas} />
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
