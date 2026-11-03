import { RiInformationLine } from '@remixicon/react';
import { dataHoraComSegundos, fimDoDia, inicioDoDia } from '@compartilhado/formatos';
import { eUuid } from '@compartilhado/ids';
import { ACAO_DO_CLIENTE, rotulo } from '@compartilhado/rotulos';
import type { LogCliente, Modo } from '@compartilhado/tipos';
import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/base/input/input';
import { type FiltroLogCliente, useLogsDosClientes, useNomesDosProfissionais, useProfissionais } from '../api/consultas';
import { FiltroComBusca, FiltroDeLista, FiltroDePeriodo, GradeDeFiltros, type Periodo } from '../componentes/Filtros';
import { EstadoDaConsulta, Pagina, Quadro } from '../componentes/Pagina';
import { Codigo, IdCurto, SeloModo, Valor } from '../componentes/Selos';
import { type Coluna, Paginacao, Tabela } from '../componentes/Tabela';

const TAMANHO_DA_PAGINA = 50;

const ACOES = Object.entries(ACAO_DO_CLIENTE).map(([valor, rotuloDaAcao]) => ({ valor, rotulo: rotuloDaAcao }));
const MODOS = [
  { valor: 'ONLINE' satisfies Modo, rotulo: 'Online' },
  { valor: 'OFFLINE' satisfies Modo, rotulo: 'Offline' },
];

function Detalhes({ detalhes }: { detalhes: Record<string, unknown> | null }) {
  if (!detalhes || Object.keys(detalhes).length === 0) return <Valor vazio="—">{null}</Valor>;
  return (
    <dl className="flex flex-col gap-0.5">
      {Object.entries(detalhes).map(([chave, valor]) => (
        <div key={chave} className="flex gap-1.5 text-caption-1-regular [overflow-wrap:anywhere]">
          <dt className="text-text-tertiary">{chave}:</dt>
          <dd className="text-text-primary">{typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LogsClientes() {
  const profissionais = useProfissionais();
  const nomes = useNomesDosProfissionais();
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const [dispositivo, setDispositivo] = useState('');
  const [acao, setAcao] = useState<string | null>(null);
  const [modo, setModo] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>([null, null]);
  const [pagina, setPagina] = useState(1);
  const dispositivoValido = !dispositivo.trim() || eUuid(dispositivo);

  const filtro: FiltroLogCliente = useMemo(
    () => ({
      profissionalId,
      dispositivoId: dispositivo.trim() && eUuid(dispositivo) ? dispositivo.trim() : null,
      acao,
      modo,
      de: periodo[0] ? inicioDoDia(periodo[0]) : null,
      ate: periodo[1] ? fimDoDia(periodo[1]) : periodo[0] ? fimDoDia(periodo[0]) : null,
      pagina,
      tamanho: TAMANHO_DA_PAGINA,
    }),
    [profissionalId, dispositivo, acao, modo, periodo, pagina],
  );
  const consulta = useLogsDosClientes(filtro);

  const chaveDosFiltros = JSON.stringify({ ...filtro, pagina: 0 });
  useEffect(() => {
    setPagina(1);
  }, [chaveDosFiltros]);

  const colunas: Coluna<LogCliente>[] = [
    {
      titulo: 'Quando (no aparelho)',
      semQuebra: true,
      celula: (l) => (
        <div className="flex flex-col">
          <span className="font-mono text-body-2-regular tabular-nums">{dataHoraComSegundos(l.dataHora)}</span>
          <span className="text-caption-1-regular text-text-tertiary tabular-nums">recebido {dataHoraComSegundos(l.recebidoEm)}</span>
        </div>
      ),
    },
    {
      titulo: 'Ação',
      celula: (l) => (
        <div className="flex flex-col items-start gap-1">
          <span className="text-body-semibold text-text-primary">{rotulo(ACAO_DO_CLIENTE, l.acao)}</span>
          <Codigo>{l.acao}</Codigo>
        </div>
      ),
    },
    { titulo: 'Modo', semQuebra: true, celula: (l) => <SeloModo modo={l.modo} /> },
    {
      titulo: 'Profissional',
      celula: (l) => <Valor vazio="—">{l.profissionalId ? (nomes.get(l.profissionalId) ?? l.profissionalId) : null}</Valor>,
    },
    {
      titulo: 'Dispositivo',
      celula: (l) => (
        <div className="flex flex-col items-start gap-1">
          <span>{l.dispositivoNome ?? '—'}</span>
          <IdCurto id={l.dispositivoId} />
        </div>
      ),
    },
    { titulo: 'Detalhes', celula: (l) => <Detalhes detalhes={l.detalhes} /> },
    { titulo: 'Enviado por', celula: (l) => nomes.get(l.enviadoPorId) ?? l.enviadoPorId },
  ];

  const dados = consulta.data;
  return (
    <Pagina
      titulo="Logs dos clientes"
      descricao="Ações feitas nos aparelhos, principalmente as offline, que o servidor só conhece quando o aparelho sincroniza."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
      atualizadoEm={consulta.dataUpdatedAt}
    >
      <Quadro
        barra={
          <GradeDeFiltros>
            <FiltroComBusca
              rotulo="Profissional"
              opcoes={(profissionais.data ?? []).map((p) => ({ valor: p.id, rotulo: p.nome }))}
              valor={profissionalId}
              aoMudar={setProfissionalId}
            />
            <FiltroComBusca rotulo="Ação" placeholder="Todas" opcoes={ACOES} valor={acao} aoMudar={setAcao} />
            <FiltroDeLista rotulo="Modo" opcoes={MODOS} valor={modo} aoMudar={setModo} />
            <Input
              label="ID do dispositivo"
              placeholder="UUID do aparelho"
              value={dispositivo}
              onChange={setDispositivo}
              isInvalid={!dispositivoValido}
              errorMessage="Cole o ID completo (UUID)"
            />
            <FiltroDePeriodo valor={periodo} aoMudar={setPeriodo} />
          </GradeDeFiltros>
        }
        rodape={
          dados && (
            <div className="flex flex-col gap-3">
              <Paginacao
                pagina={dados.pagina}
                paginas={Math.max(1, Math.ceil(dados.total / dados.tamanho))}
                total={dados.total}
                aoMudar={setPagina}
              />
              <p className="flex items-center gap-1.5 text-caption-1-medium text-text-tertiary">
                <RiInformationLine className="size-4" aria-hidden />
                Data/hora pelo relógio do aparelho; "recebido" é a hora do servidor.
              </p>
            </div>
          )
        }
      >
        <EstadoDaConsulta consulta={consulta}>
          {() =>
            dados && (
              <Tabela
                rotulo="Logs dos clientes"
                itens={dados.itens}
                colunas={colunas}
                chave={(l) => l.id}
                vazio="Nenhuma ação encontrada com esses filtros."
                larguraMinima={1100}
              />
            )
          }
        </EstadoDaConsulta>
      </Quadro>
    </Pagina>
  );
}
