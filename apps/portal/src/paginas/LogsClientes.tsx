import { Badge, Card, Code, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { DatePickerInput, type DatesRangeValue } from '@mantine/dates';
import { IconCalendar } from '@tabler/icons-react';
import { dataHoraComSegundos, fimDoDia, inicioDoDia } from '@compartilhado/formatos';
import { eUuid } from '@compartilhado/ids';
import { ACAO_DO_CLIENTE, rotulo } from '@compartilhado/rotulos';
import type { LogCliente, Modo } from '@compartilhado/tipos';
import { useEffect, useMemo, useState } from 'react';
import { type FiltroLogCliente, useLogsDosClientes, useNomesDosProfissionais, useProfissionais } from '../api/consultas';
import { EstadoDaConsulta, Pagina } from '../componentes/Pagina';
import { IdCurto, SeloModo, Valor } from '../componentes/Selos';
import { type Coluna, Paginacao, Tabela } from '../componentes/Tabela';

const TAMANHO_DA_PAGINA = 50;

function Detalhes({ detalhes }: { detalhes: Record<string, unknown> | null }) {
  if (!detalhes || Object.keys(detalhes).length === 0) return <Valor vazio="—">{null}</Valor>;
  return (
    <Stack gap={0}>
      {Object.entries(detalhes).map(([chave, valor]) => (
        <Text key={chave} size="xs" style={{ overflowWrap: 'anywhere' }}>
          <Text span c="dimmed" size="xs">
            {chave}:
          </Text>{' '}
          {typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}
        </Text>
      ))}
    </Stack>
  );
}

export function LogsClientes() {
  const profissionais = useProfissionais();
  const nomes = useNomesDosProfissionais();
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const [dispositivo, setDispositivo] = useState('');
  const [acao, setAcao] = useState<string | null>(null);
  const [modo, setModo] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<DatesRangeValue<string>>([null, null]);
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
      celula: (l) => (
        <Stack gap={0}>
          <Text size="sm" ff="monospace">
            {dataHoraComSegundos(l.dataHora)}
          </Text>
          <Text size="xs" c="dimmed">
            recebido {dataHoraComSegundos(l.recebidoEm)}
          </Text>
        </Stack>
      ),
    },
    {
      titulo: 'Ação',
      celula: (l) => (
        <Stack gap={2}>
          <Text size="sm" fw={600}>
            {rotulo(ACAO_DO_CLIENTE, l.acao)}
          </Text>
          <Code fz="xs">{l.acao}</Code>
        </Stack>
      ),
    },
    { titulo: 'Modo', celula: (l) => <SeloModo modo={l.modo} /> },
    {
      titulo: 'Profissional',
      celula: (l) => <Valor vazio="—">{l.profissionalId ? (nomes.get(l.profissionalId) ?? l.profissionalId) : null}</Valor>,
    },
    {
      titulo: 'Dispositivo',
      celula: (l) => (
        <Stack gap={2}>
          <Text size="sm">{l.dispositivoNome ?? '—'}</Text>
          <IdCurto id={l.dispositivoId} />
        </Stack>
      ),
    },
    { titulo: 'Detalhes', celula: (l) => <Detalhes detalhes={l.detalhes} /> },
    {
      titulo: 'Enviado por',
      celula: (l) => <Text size="sm">{nomes.get(l.enviadoPorId) ?? l.enviadoPorId}</Text>,
    },
  ];

  return (
    <Pagina
      titulo="Logs dos clientes"
      descricao="Ações feitas nos aparelhos, principalmente as offline, que o servidor só conhece quando o aparelho sincroniza."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
    >
      <Card withBorder padding="md">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          <Select
            label="Profissional"
            placeholder="Todos"
            data={(profissionais.data ?? []).map((p) => ({ value: p.id, label: p.nome }))}
            value={profissionalId}
            onChange={setProfissionalId}
            searchable
            clearable
          />
          <Select
            label="Ação"
            placeholder="Todas"
            data={Object.entries(ACAO_DO_CLIENTE).map(([value, label]) => ({ value, label }))}
            value={acao}
            onChange={setAcao}
            searchable
            clearable
          />
          <Select
            label="Modo"
            placeholder="Todos"
            data={[
              { value: 'ONLINE' satisfies Modo, label: 'Online' },
              { value: 'OFFLINE' satisfies Modo, label: 'Offline' },
            ]}
            value={modo}
            onChange={setModo}
            clearable
          />
          <TextInput
            label="ID do dispositivo"
            placeholder="UUID do aparelho"
            value={dispositivo}
            onChange={(e) => setDispositivo(e.currentTarget.value)}
            error={dispositivoValido ? undefined : 'Cole o ID completo (UUID)'}
          />
          <DatePickerInput
            type="range"
            label="Período"
            placeholder="Escolha as datas"
            leftSection={<IconCalendar size={16} />}
            value={periodo}
            onChange={setPeriodo}
            clearable
            valueFormat="DD/MM/YYYY"
            allowSingleDateInRange
          />
        </SimpleGrid>
      </Card>
      <EstadoDaConsulta consulta={consulta}>
        {() => {
          const dados = consulta.data;
          if (!dados) return null;
          return (
            <Stack gap="sm">
              <Tabela itens={dados.itens} colunas={colunas} chave={(l) => l.id} vazio="Nenhuma ação encontrada com esses filtros." larguraMinima={1100} />
              <Paginacao
                pagina={dados.pagina}
                paginas={Math.max(1, Math.ceil(dados.total / dados.tamanho))}
                total={dados.total}
                aoMudar={setPagina}
              />
            </Stack>
          );
        }}
      </EstadoDaConsulta>
      <Badge variant="outline" color="gray" style={{ alignSelf: 'flex-start' }}>
        Data/hora pelo relógio do aparelho; "recebido" é a hora do servidor
      </Badge>
    </Pagina>
  );
}
