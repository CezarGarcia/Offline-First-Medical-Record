import 'swagger-ui-react/swagger-ui.css';

import { RiCodeSSlashLine, RiFileTextLine, RiShieldUserLine, RiStethoscopeLine } from '@remixicon/react';
import { useState } from 'react';
import SwaggerUI from 'swagger-ui-react';
import { Tab, TabList, TabPanel, Tabs } from '@/components/base/tabs/tabs';
import { api } from '../api/cliente';
import { useEspecificacao } from '../api/consultas';
import { Aviso, Cartao, EstadoDaConsulta, Pagina } from '../componentes/Pagina';

type Servico = 'ms-auth' | 'ms-clinico' | 'ms-docs';

const SERVICOS = [
  { valor: 'ms-auth', rotulo: 'ms-auth (TypeScript)', descricao: 'Login, sessão, profissionais e auditoria', icone: RiShieldUserLine },
  {
    valor: 'ms-clinico',
    rotulo: 'ms-clinico (Java)',
    descricao: 'Pessoas, prontuários, atendimentos, medicamentos e sincronização',
    icone: RiStethoscopeLine,
  },
  { valor: 'ms-docs', rotulo: 'ms-docs (Python)', descricao: 'PDF da ficha e envio por e-mail', icone: RiFileTextLine },
] as const satisfies readonly { valor: Servico; rotulo: string; descricao: string; icone: unknown }[];

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
        // O Swagger UI tem o próprio CSS claro: fica num fundo claro também no tema escuro
        <div className="rounded-2xl bg-white p-2 text-black">
          <SwaggerUI
            spec={consulta.data}
            requestInterceptor={comToken}
            docExpansion="list"
            defaultModelsExpandDepth={-1}
            deepLinking={false}
          />
        </div>
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
      <Aviso titulo="As requisições são de verdade">
        Os botões <b>Try it out</b> fazem requisições com o seu token de administrador. Elas aparecem nos logs de acesso como qualquer
        outra.
      </Aviso>
      <Cartao className="p-4">
        <Tabs selectedKey={servico} onSelectionChange={(chave) => setServico(chave as Servico)}>
          <TabList aria-label="Serviços">
            {SERVICOS.map((s) => (
              <Tab key={s.valor} id={s.valor} icon={s.icone}>
                {s.rotulo}
              </Tab>
            ))}
          </TabList>
          {SERVICOS.map((s) => (
            <TabPanel key={s.valor} id={s.valor} className="flex flex-col gap-3 pt-4">
              <p className="flex items-center gap-2 text-body-regular text-text-secondary">
                <RiCodeSSlashLine className="size-4" aria-hidden />
                {s.descricao}
              </p>
              <Especificacao servico={s.valor} />
            </TabPanel>
          ))}
        </Tabs>
      </Cartao>
    </Pagina>
  );
}
