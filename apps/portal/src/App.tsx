import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router/dom';
import { criarClienteDeConsultas } from './api/consultas';
import { criarRotas } from './rotas';
import { tema } from './tema';

export function App() {
  const [consultas] = useState(criarClienteDeConsultas);
  const [rotas] = useState(() => criarRotas(consultas));
  return (
    <MantineProvider theme={tema} defaultColorScheme="light">
      <DatesProvider settings={{ locale: 'pt-br', firstDayOfWeek: 0 }}>
        <Notifications position="top-right" />
        <QueryClientProvider client={consultas}>
          <RouterProvider router={rotas} />
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
