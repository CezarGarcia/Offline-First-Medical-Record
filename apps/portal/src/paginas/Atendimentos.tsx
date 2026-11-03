import { RiAlarmWarningFill, RiFileList3Fill, RiTimeFill, RiWifiOffFill } from '@remixicon/react';
import { useMemo, useState } from 'react';
import { ImportantAlertsCard, type ImportantAlert } from '@/components/application/medical/important-alerts-card';
import { type Stat, StatCards } from '@/components/application/dashboard/stat-cards';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import { dataHora, diaEmBrasilia, normalizar } from '@compartilhado/formatos';
import { COR, COR_HEX, DESFECHO, TIPO_OCORRENCIA, rotulo } from '@compartilhado/rotulos';
import type { AtendimentoResumo, CorTriagem } from '@compartilhado/tipos';
import { useAtendimentos } from '../api/consultas';
import { FiltroDeBusca, FiltroDePeriodo, GradeDeFiltros, type Periodo } from '../componentes/Filtros';
import { Cartao, EstadoDaConsulta, Pagina, Quadro } from '../componentes/Pagina';
import { Etiqueta, NomeComAvatar, SeloModo, SeloTriagem, Valor } from '../componentes/Selos';
import { type Coluna, Paginacao, Tabela, usePaginacao } from '../componentes/Tabela';

const COLUNAS: Coluna<AtendimentoResumo>[] = [
  { titulo: 'Data/hora', semQuebra: true, celula: (a) => <span className="tabular-nums">{dataHora(a.dataHora)}</span> },
  { titulo: 'Paciente', celula: (a) => <NomeComAvatar nome={a.pessoa.nome} detalhe={rotulo(TIPO_OCORRENCIA, a.tipoOcorrencia)} /> },
  { titulo: 'Triagem', semQuebra: true, celula: (a) => <SeloTriagem triagem={a.triagem} /> },
  {
    titulo: 'Desfecho',
    celula: (a) => (
      <div className="flex flex-col">
        <span>{rotulo(DESFECHO, a.desfecho.tipo)}</span>
        {a.desfecho.destino && <span className="text-caption-1-regular text-text-tertiary">{a.desfecho.destino}</span>}
      </div>
    ),
  },
  {
    titulo: 'Profissional',
    semQuebra: true,
    celula: (a) => (
      <div className="flex flex-col">
        <span>{a.origem.criadoPorNome}</span>
        <span className="text-caption-1-regular text-text-tertiary">{a.origem.criadoPorRegistro}</span>
      </div>
    ),
  },
  {
    titulo: 'Origem',
    semQuebra: true,
    celula: (a) => (
      <div className="flex flex-col items-start gap-1">
        <SeloModo modo={a.origem.modo} />
        <span className="text-caption-1-regular text-text-tertiary">
          <Valor vazio="sem dispositivo">{a.origem.dispositivoNome}</Valor>
        </span>
      </div>
    ),
  },
  { titulo: 'Recebido em', semQuebra: true, celula: (a) => <span className="tabular-nums">{dataHora(a.sincronizacao.recebidoEm)}</span> },
];

const GRAVES: CorTriagem[] = ['VERMELHO', 'LARANJA'];
const ORDEM_DAS_CORES: CorTriagem[] = ['VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL', 'PRETO'];

function porcentagem(parte: number, total: number): string {
  return total ? `${Math.round((parte / total) * 100)}%` : '0%';
}

/** Os números do topo, contados sobre todas as fichas recebidas. */
function indicadores(atendimentos: AtendimentoResumo[]): Stat[] {
  const agora = Date.now();
  const hoje = diaEmBrasilia(new Date(agora).toISOString());
  const total = atendimentos.length;
  const deHoje = atendimentos.filter((a) => diaEmBrasilia(a.dataHora) === hoje).length;
  const recentes = atendimentos.filter((a) => agora - Date.parse(a.dataHora) <= 24 * 3_600_000).length;
  const offline = atendimentos.filter((a) => a.origem.modo === 'OFFLINE').length;
  const graves = atendimentos.filter((a) => GRAVES.includes(a.triagem.cor)).length;
  return [
    {
      icon: RiFileList3Fill,
      label: 'Fichas recebidas',
      value: String(total),
      delta: deHoje ? `+${deHoje} hoje` : 'nenhuma hoje',
      deltaColor: deHoje ? 'lime' : 'neutral',
      tone: 'blue',
      caption: 'Registradas hoje',
      hint: 'Todas as fichas de atendimento que já chegaram ao servidor. Hoje é contado no horário de Brasília.',
    },
    {
      icon: RiTimeFill,
      label: 'Últimas 24 horas',
      value: String(recentes),
      delta: porcentagem(recentes, total),
      deltaColor: 'neutral',
      tone: 'sky',
      caption: 'Do total de fichas',
      hint: 'Atendimentos feitos nas últimas 24 horas (pela hora do atendimento, não da sincronização).',
    },
    {
      icon: RiWifiOffFill,
      label: 'Registradas offline',
      value: String(offline),
      delta: porcentagem(offline, total),
      deltaColor: 'neutral',
      tone: 'orange',
      caption: 'Sincronizadas depois',
      hint: 'Fichas feitas sem internet no aparelho, que o servidor só recebeu quando o aparelho sincronizou.',
    },
    {
      icon: RiAlarmWarningFill,
      label: 'Casos graves',
      value: String(graves),
      delta: porcentagem(graves, total),
      deltaColor: graves ? 'rose' : 'neutral',
      tone: 'pink',
      caption: 'Vermelha ou laranja',
      hint: 'Atendimentos com triagem vermelha ou laranja (emergência e muito urgente).',
    },
  ];
}

/** Barra empilhada com a quantidade de fichas de cada cor da triagem, nas cores do PDF. */
function DistribuicaoDaTriagem({ atendimentos }: { atendimentos: AtendimentoResumo[] }) {
  const total = atendimentos.length;
  const contagem = ORDEM_DAS_CORES.map((cor) => ({ cor, quantidade: atendimentos.filter((a) => a.triagem.cor === cor).length })).filter(
    (item) => item.quantidade > 0,
  );
  return (
    <Cartao className="flex h-[330px] min-w-0 flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-body-medium text-text-secondary">Triagem por cor</h2>
          <p className="flex items-baseline gap-1">
            <span className="text-title-1-medium text-text-primary tabular-nums">{total}</span>
            <span className="text-caption-1-medium text-text-secondary">{total === 1 ? 'ficha' : 'fichas'}</span>
          </p>
        </div>
        <Etiqueta>Manchester e START</Etiqueta>
      </div>
      {total === 0 ? (
        <p className="text-body-regular text-text-tertiary">Ainda não há fichas.</p>
      ) : (
        <>
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {contagem.map(({ cor, quantidade }) => (
              <span
                key={cor}
                className="h-full transition-[flex-grow] duration-500 ease-out first:rounded-s-full last:rounded-e-full"
                style={{ flexGrow: quantidade, backgroundColor: COR_HEX[cor].fundo }}
              />
            ))}
          </div>
          <ul className="grid min-h-0 flex-1 grid-cols-1 content-start gap-1.5 overflow-y-auto sm:grid-cols-2">
            {contagem.map(({ cor, quantidade }, ordem) => (
              <li
                key={cor}
                className="cartao-entra flex items-center justify-between gap-3 rounded-2lg bg-background-bloco px-3 py-2"
                style={{ ['--ordem' as string]: ordem }}
              >
                <span className="flex items-center gap-2 text-body-medium text-text-primary">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: COR_HEX[cor].fundo }} aria-hidden />
                  {COR[cor]}
                </span>
                <span className="flex items-baseline gap-1.5 tabular-nums">
                  <span className="text-body-semibold text-text-primary">{quantidade}</span>
                  <span className="text-caption-1-medium text-text-tertiary">{porcentagem(quantidade, total)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Cartao>
  );
}

/** Os casos graves mais recentes, no cartão de alertas do BoardUI; cada um abre a ficha. */
function CasosGraves({ atendimentos }: { atendimentos: AtendimentoResumo[] }) {
  const graves = atendimentos.filter((a) => GRAVES.includes(a.triagem.cor));
  const alertas: ImportantAlert[] = [...graves]
    .sort((a, b) => b.dataHora.localeCompare(a.dataHora))
    .slice(0, 12)
    .map((a) => ({
      id: a.id,
      icon: RiAlarmWarningFill,
      iconStyle: { backgroundColor: COR_HEX[a.triagem.cor].fundo },
      title: a.pessoa.nome,
      description: `${COR[a.triagem.cor]} · ${rotulo(TIPO_OCORRENCIA, a.tipoOcorrencia)} · ${rotulo(DESFECHO, a.desfecho.tipo)}`,
      date: dataHora(a.dataHora)?.slice(0, 5),
      href: `/atendimentos/${a.id}`,
    }));
  return (
    <ImportantAlertsCard
      title="Casos graves recentes"
      count={graves.length}
      countCaption={graves.length === 1 ? 'caso' : 'casos'}
      badge={<Etiqueta cor="rose">Vermelho e laranja</Etiqueta>}
      alerts={alertas}
      emptyState={<p className="px-1.5 text-body-regular text-text-tertiary">Nenhum caso grave até agora.</p>}
      className="rounded-3xl"
    />
  );
}

function PainelCarregando() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Carregando">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((indice) => (
          <Skeleton key={indice} className="h-[176px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Skeleton className="h-[330px] rounded-3xl" />
        <Skeleton className="h-[330px] rounded-3xl" />
      </div>
    </div>
  );
}

export function Atendimentos() {
  const consulta = useAtendimentos();
  const [paciente, setPaciente] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>([null, null]);
  const todos = useMemo(() => consulta.data ?? [], [consulta.data]);

  const filtrados = useMemo(() => {
    const busca = normalizar(paciente);
    const [de, ate] = periodo;
    return todos.filter((a) => {
      if (busca && !normalizar(a.pessoa.nome).includes(busca) && !(a.pessoa.cpf ?? '').includes(busca)) return false;
      const dia = diaEmBrasilia(a.dataHora);
      if (de && dia < de) return false;
      if (ate && dia > ate) return false;
      return true;
    });
  }, [todos, paciente, periodo]);

  const { pagina, paginas, setPagina, itensDaPagina } = usePaginacao(filtrados, 20, [paciente, periodo]);

  return (
    <Pagina
      titulo="Atendimentos"
      descricao="Todas as fichas de atendimento recebidas pelo servidor, da mais recente para a mais antiga."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
      atualizadoEm={consulta.dataUpdatedAt}
    >
      {consulta.isPending ? (
        <PainelCarregando />
      ) : consulta.isSuccess ? (
        <>
          <StatCards variant="footer" stats={indicadores(todos)} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <DistribuicaoDaTriagem atendimentos={todos} />
            <CasosGraves atendimentos={todos} />
          </div>
        </>
      ) : null}

      <Quadro
        barra={
          <GradeDeFiltros colunas={2}>
            <FiltroDeBusca rotulo="Paciente" placeholder="Nome ou CPF" valor={paciente} aoMudar={setPaciente} />
            <FiltroDePeriodo valor={periodo} aoMudar={setPeriodo} />
          </GradeDeFiltros>
        }
        rodape={consulta.isSuccess && <Paginacao pagina={pagina} paginas={paginas} total={filtrados.length} aoMudar={setPagina} />}
      >
        <EstadoDaConsulta consulta={consulta}>
          {() => (
            <Tabela
              rotulo="Atendimentos"
              itens={itensDaPagina}
              colunas={COLUNAS}
              chave={(a) => a.id}
              link={(a) => `/atendimentos/${a.id}`}
              vazio="Nenhum atendimento encontrado."
              larguraMinima={1100}
            />
          )}
        </EstadoDaConsulta>
      </Quadro>
    </Pagina>
  );
}
