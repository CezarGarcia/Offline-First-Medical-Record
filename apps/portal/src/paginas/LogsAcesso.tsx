import { dataHoraComSegundos, fimDoDia, inicioDoDia } from '@compartilhado/formatos';
import type { LogAcesso } from '@compartilhado/tipos';
import { useEffect, useMemo, useState } from 'react';
import { Focusable } from 'react-aria-components';
import { NumberField } from '@/components/base/number-field/number-field';
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip';
import { cx } from '@/utils/cx';
import { type FiltroLogAcesso, useLogsDeAcesso, useNomesDosProfissionais, useProfissionais } from '../api/consultas';
import { FiltroComBusca, FiltroDeBusca, FiltroDeLista, FiltroDePeriodo, GradeDeFiltros, type Periodo } from '../componentes/Filtros';
import { EstadoDaConsulta, Pagina, Quadro } from '../componentes/Pagina';
import { Codigo, IdCurto, SeloStatusHttp, Valor } from '../componentes/Selos';
import { type Coluna, Paginacao, Tabela } from '../componentes/Tabela';
import { useAtrasado } from '../util/useAtrasado';

const TAMANHO_DA_PAGINA = 50;

/** Quem fez a requisição, pelo user-agent (o texto completo aparece ao passar o mouse). */
export function origemDoAcesso(userAgent: string | null): string {
  if (!userAgent) return '—';
  if (userAgent === 'ms-docs') return 'ms-docs (interno)';
  if (/PostmanRuntime/i.test(userAgent)) return 'Postman';
  if (/MedicalField|Electron/i.test(userAgent)) return 'App cliente';
  if (/curl/i.test(userAgent)) return 'curl';
  if (/python|httpx|aiohttp/i.test(userAgent)) return 'Python';
  if (/node|undici|axios/i.test(userAgent)) return 'Node.js';
  if (/Mozilla/i.test(userAgent)) return 'Navegador (portal)';
  return userAgent.slice(0, 30);
}

/** Cada serviço com a sua cor (as cores de gráfico do tema: funcionam no claro e no escuro). */
const COR_DO_SERVICO: Record<string, string> = { 'ms-auth': 'bg-chart-3', 'ms-clinico': 'bg-chart-1', 'ms-docs': 'bg-chart-2' };

const SERVICOS = ['ms-auth', 'ms-clinico', 'ms-docs'].map((s) => ({ valor: s, rotulo: s }));
const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ valor: m, rotulo: m }));

export function LogsAcesso() {
  const profissionais = useProfissionais();
  const nomes = useNomesDosProfissionais();
  const [servico, setServico] = useState<string | null>(null);
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<string | null>(null);
  const [status, setStatus] = useState<number>(Number.NaN);
  const [rota, setRota] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>([null, null]);
  const [pagina, setPagina] = useState(1);
  const rotaDigitada = useAtrasado(rota.trim());
  const statusDigitado = useAtrasado(status);

  const filtro: FiltroLogAcesso = useMemo(
    () => ({
      servico,
      profissionalId,
      metodo,
      status: Number.isInteger(statusDigitado) && statusDigitado >= 100 && statusDigitado <= 599 ? statusDigitado : null,
      rota: rotaDigitada || null,
      de: periodo[0] ? inicioDoDia(periodo[0]) : null,
      ate: periodo[1] ? fimDoDia(periodo[1]) : periodo[0] ? fimDoDia(periodo[0]) : null,
      pagina,
      tamanho: TAMANHO_DA_PAGINA,
    }),
    [servico, profissionalId, metodo, statusDigitado, rotaDigitada, periodo, pagina],
  );
  const consulta = useLogsDeAcesso(filtro);

  // Mudou um filtro: volta para a primeira página
  const chaveDosFiltros = JSON.stringify({ ...filtro, pagina: 0 });
  useEffect(() => {
    setPagina(1);
  }, [chaveDosFiltros]);

  const colunas: Coluna<LogAcesso>[] = [
    {
      titulo: 'Data/hora',
      semQuebra: true,
      celula: (l) => <span className="font-mono text-body-2-regular tabular-nums">{dataHoraComSegundos(l.dataHora)}</span>,
    },
    {
      titulo: 'Serviço',
      semQuebra: true,
      celula: (l) => (
        <span className="flex items-center gap-2">
          <span className={cx('size-2 rounded-full', COR_DO_SERVICO[l.servico] ?? 'bg-text-tertiary')} aria-hidden />
          {l.servico}
        </span>
      ),
    },
    { titulo: 'IP', semQuebra: true, celula: (l) => <span className="font-mono text-body-2-regular">{l.ipCliente}</span> },
    {
      titulo: 'Profissional',
      celula: (l) => (
        <Valor vazio="— (sem token válido)">{l.profissionalId ? (nomes.get(l.profissionalId) ?? l.profissionalId) : null}</Valor>
      ),
    },
    { titulo: 'Método', semQuebra: true, celula: (l) => <Codigo>{l.metodo}</Codigo> },
    { titulo: 'Rota', celula: (l) => <span className="font-mono text-body-2-regular [overflow-wrap:anywhere]">{l.rota}</span> },
    { titulo: 'Status', semQuebra: true, celula: (l) => <SeloStatusHttp status={l.statusCode} /> },
    { titulo: 'Tempo', semQuebra: true, celula: (l) => <span className="font-mono text-body-2-regular tabular-nums">{l.tempoMs} ms</span> },
    { titulo: 'Dispositivo', semQuebra: true, celula: (l) => <IdCurto id={l.dispositivoId} /> },
    {
      titulo: 'Origem',
      semQuebra: true,
      celula: (l) => (
        <TooltipTrigger delay={250}>
          <Focusable>
            <span
              tabIndex={0}
              className="cursor-help rounded-md text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              {origemDoAcesso(l.userAgent)}
            </span>
          </Focusable>
          <Tooltip size="md" className="max-w-sm break-words">
            {l.userAgent ?? 'sem user-agent'}
          </Tooltip>
        </TooltipTrigger>
      ),
    },
  ];

  const dados = consulta.data;
  return (
    <Pagina
      titulo="Logs de acesso"
      descricao="Uma linha por requisição recebida pelos três serviços (o middleware de log do enunciado): data/hora, IP, profissional, método, rota, status e tempo. Os logs não podem ser alterados nem apagados."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
      atualizadoEm={consulta.dataUpdatedAt}
    >
      <Quadro
        barra={
          <GradeDeFiltros>
            <FiltroDeLista rotulo="Serviço" opcoes={SERVICOS} valor={servico} aoMudar={setServico} />
            <FiltroComBusca
              rotulo="Profissional"
              opcoes={(profissionais.data ?? []).map((p) => ({ valor: p.id, rotulo: p.nome }))}
              valor={profissionalId}
              aoMudar={setProfissionalId}
            />
            <FiltroDeLista rotulo="Método" opcoes={METODOS} valor={metodo} aoMudar={setMetodo} />
            <NumberField
              label="Status"
              placeholder="ex.: 401"
              value={status}
              onChange={setStatus}
              minValue={100}
              maxValue={599}
              hideSteppers
              formatOptions={{ useGrouping: false, maximumFractionDigits: 0 }}
            />
            <FiltroDeBusca rotulo="Rota contém" placeholder="ex.: /api/atendimento" valor={rota} aoMudar={setRota} />
            <FiltroDePeriodo valor={periodo} aoMudar={setPeriodo} />
          </GradeDeFiltros>
        }
        rodape={
          dados && (
            <Paginacao
              pagina={dados.pagina}
              paginas={Math.max(1, Math.ceil(dados.total / dados.tamanho))}
              total={dados.total}
              aoMudar={setPagina}
            />
          )
        }
      >
        <EstadoDaConsulta consulta={consulta}>
          {() =>
            dados && (
              <Tabela
                rotulo="Logs de acesso"
                itens={dados.itens}
                colunas={colunas}
                chave={(l) => l.id}
                vazio="Nenhum acesso encontrado com esses filtros."
                larguraMinima={1300}
              />
            )
          }
        </EstadoDaConsulta>
      </Quadro>
    </Pagina>
  );
}
