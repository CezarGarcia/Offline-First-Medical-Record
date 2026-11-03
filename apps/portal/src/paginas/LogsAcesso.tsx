import { Card, Code, ColorSwatch, Group, NumberInput, Select, SimpleGrid, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { DatePickerInput, type DatesRangeValue } from '@mantine/dates';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCalendar } from '@tabler/icons-react';
import { dataHoraComSegundos, fimDoDia, inicioDoDia } from '@compartilhado/formatos';
import type { LogAcesso } from '@compartilhado/tipos';
import { useEffect, useMemo, useState } from 'react';
import { type FiltroLogAcesso, useLogsDeAcesso, useNomesDosProfissionais, useProfissionais } from '../api/consultas';
import { EstadoDaConsulta, Pagina } from '../componentes/Pagina';
import { IdCurto, SeloStatusHttp, Valor } from '../componentes/Selos';
import { type Coluna, Paginacao, Tabela } from '../componentes/Tabela';

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
const COR_DO_SERVICO: Record<string, string> = { 'ms-auth': 'grape', 'ms-clinico': 'marca', 'ms-docs': 'teal' };

export function LogsAcesso() {
  const profissionais = useProfissionais();
  const nomes = useNomesDosProfissionais();
  const [servico, setServico] = useState<string | null>(null);
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<string | null>(null);
  const [status, setStatus] = useState<string | number>('');
  const [rota, setRota] = useState('');
  const [periodo, setPeriodo] = useState<DatesRangeValue<string>>([null, null]);
  const [pagina, setPagina] = useState(1);
  const [rotaDigitada] = useDebouncedValue(rota.trim(), 400);
  const [statusDigitado] = useDebouncedValue(status, 400);

  const filtro: FiltroLogAcesso = useMemo(
    () => ({
      servico,
      profissionalId,
      metodo,
      status: typeof statusDigitado === 'number' && statusDigitado >= 100 && statusDigitado <= 599 ? statusDigitado : null,
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
    { titulo: 'Data/hora', semQuebra: true, celula: (l) => <Text size="sm" ff="monospace">{dataHoraComSegundos(l.dataHora)}</Text> },
    {
      titulo: 'Serviço',
      semQuebra: true,
      celula: (l) => (
        <Group gap={6} wrap="nowrap">
          <ColorSwatch size={10} color={`var(--mantine-color-${COR_DO_SERVICO[l.servico] ?? 'gray'}-6)`} withShadow={false} />
          <Text size="sm">{l.servico}</Text>
        </Group>
      ),
    },
    { titulo: 'IP', semQuebra: true, celula: (l) => <Text size="sm" ff="monospace">{l.ipCliente}</Text> },
    {
      titulo: 'Profissional',
      celula: (l) => <Valor vazio="— (sem token válido)">{l.profissionalId ? (nomes.get(l.profissionalId) ?? l.profissionalId) : null}</Valor>,
    },
    { titulo: 'Método', semQuebra: true, celula: (l) => <Code>{l.metodo}</Code> },
    { titulo: 'Rota', celula: (l) => <Text size="sm" ff="monospace" style={{ overflowWrap: 'anywhere' }}>{l.rota}</Text> },
    { titulo: 'Status', semQuebra: true, celula: (l) => <SeloStatusHttp status={l.statusCode} /> },
    { titulo: 'Tempo', semQuebra: true, celula: (l) => <Text size="sm" ff="monospace">{l.tempoMs} ms</Text> },
    { titulo: 'Dispositivo', semQuebra: true, celula: (l) => <IdCurto id={l.dispositivoId} /> },
    {
      titulo: 'Origem',
      semQuebra: true,
      celula: (l) => (
        <Tooltip label={l.userAgent ?? 'sem user-agent'} multiline maw={400} withArrow>
          <Text size="sm" c="dimmed">
            {origemDoAcesso(l.userAgent)}
          </Text>
        </Tooltip>
      ),
    },
  ];

  return (
    <Pagina
      titulo="Logs de acesso"
      descricao="Uma linha por requisição recebida pelos três serviços (o middleware de log do enunciado): data/hora, IP, profissional, método, rota, status e tempo. Os logs não podem ser alterados nem apagados."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
    >
      <Card withBorder padding="md">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          <Select
            label="Serviço"
            placeholder="Todos"
            data={['ms-auth', 'ms-clinico', 'ms-docs']}
            value={servico}
            onChange={setServico}
            clearable
          />
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
            label="Método"
            placeholder="Todos"
            data={['GET', 'POST', 'PUT', 'PATCH', 'DELETE']}
            value={metodo}
            onChange={setMetodo}
            clearable
          />
          <NumberInput label="Status" placeholder="ex.: 401" value={status} onChange={setStatus} min={100} max={599} hideControls allowDecimal={false} />
          <TextInput label="Rota contém" placeholder="ex.: /api/atendimento" value={rota} onChange={(e) => setRota(e.currentTarget.value)} />
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
              <Tabela itens={dados.itens} colunas={colunas} chave={(l) => l.id} vazio="Nenhum acesso encontrado com esses filtros." larguraMinima={1300} />
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
    </Pagina>
  );
}
