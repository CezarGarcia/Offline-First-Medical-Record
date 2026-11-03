import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { RouterProvider } from 'react-router/dom';
import { Toaster } from '@/components/base/toast/toast';
import { DirectionProvider } from '@/components/foundations/direction/direction';
import { TemplateCopyProvider } from '@/components/foundations/template-copy/template-copy';
import { criarClienteDeConsultas } from './api/consultas';
import { criarRotas } from './rotas';
import { traduzir } from './traducao';

/** Idioma (datas e calendários em pt-BR), textos dos componentes em português, dados e avisos. Os testes usam os mesmos. */
export function Provedores({ consultas, children }: { consultas: QueryClient; children: ReactNode }) {
  return (
    <DirectionProvider locale="pt-BR">
      <TemplateCopyProvider translate={traduzir}>
        <QueryClientProvider client={consultas}>
          {children}
          <Toaster position="top-end" />
        </QueryClientProvider>
      </TemplateCopyProvider>
    </DirectionProvider>
  );
}

export function App() {
  const [consultas] = useState(criarClienteDeConsultas);
  const [rotas] = useState(() => criarRotas(consultas));
  return (
    <Provedores consultas={consultas}>
      <RouterProvider router={rotas} />
    </Provedores>
  );
}
