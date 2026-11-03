import 'swagger-ui-react/swagger-ui.css';

import { Alert, Card, Tabs, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useState } from 'react';
import SwaggerUI from 'swagger-ui-react';
import { api } from '../api/cliente';
import { useEspecificacao } from '../api/consultas';
import { EstadoDaConsulta, Pagina } from '../componentes/Pagina';

type Servico = 'ms-auth' | 'ms-clinico' | 'ms-docs';

const SERVICOS: { valor: Servico; rotulo: string; descricao: string }[] = [
  { valor: 'ms-auth', rotulo: 'ms-auth (TypeScript)', descricao: 'Login, sessão, profissionais e auditoria' },
  { valor: 'ms-clinico', rotulo: 'ms-clinico (Java)', descricao: 'Pessoas, prontuários, atendimentos, medicamentos e sincronização' },
  { valor: 'ms-docs', rotulo: 'ms-docs (Python)', descricao: 'PDF da ficha e envio por e-mail' },
];

/** "Try it out" usa o token de quem está logado, renovado na hora se estiver vencendo. */
async function comToken(requisicao: Record<string, unknown>) {
  const token = await api.tokenAtual();
  if (token) {
    const cabecalhos = (requisicao.headers ?? {}) as Record<string, string>;
    cabecalhos.Authorization = `Bearer ${token}`;
    requisicao.headers = cabecalhos;
  }
  return requisicao;
}

function Especificacao({ servico }: { servico: Servico }) {
  const consulta = useEspecificacao(servico);
  return (
    <EstadoDaConsulta consulta={consulta}>
      {() => (
        <SwaggerUI
          spec={consulta.data}
          requestInterceptor={comToken}
          docExpansion="list"
          defaultModelsExpandDepth={-1}
          deepLinking={false}
        />
      )}
    </EstadoDaConsulta>
  );
}

export default function Api() {
  const [servico, setServico] = useState<Servico>('ms-auth');
  return (
    <Pagina
      titulo="API"
      descricao="A documentação interativa (OpenAPI) dos três serviços. Cada serviço publica a própria especificação em /api/docs/<serviço>, que também exige token."
    >
      <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />}>
        Os botões <b>Try it out</b> fazem requisições de verdade, com o seu token de administrador. Elas aparecem nos
        logs de acesso como qualquer outra.
      </Alert>
      <Card withBorder padding="md">
        <Tabs value={servico} onChange={(valor) => valor && setServico(valor as Servico)} keepMounted={false}>
          <Tabs.List>
            {SERVICOS.map((s) => (
              <Tabs.Tab key={s.valor} value={s.valor}>
                {s.rotulo}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {SERVICOS.map((s) => (
            <Tabs.Panel key={s.valor} value={s.valor} pt="md">
              <Text size="sm" c="dimmed" mb="xs">
                {s.descricao}
              </Text>
              <Especificacao servico={s.valor} />
            </Tabs.Panel>
          ))}
        </Tabs>
      </Card>
    </Pagina>
  );
}
