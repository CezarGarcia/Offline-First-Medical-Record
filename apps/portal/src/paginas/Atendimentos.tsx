import { Card, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { DatePickerInput, type DatesRangeValue } from '@mantine/dates';
import { IconCalendar, IconSearch } from '@tabler/icons-react';
import { dataHora, diaEmBrasilia, normalizar } from '@compartilhado/formatos';
import { DESFECHO, TIPO_OCORRENCIA, rotulo } from '@compartilhado/rotulos';
import type { AtendimentoResumo } from '@compartilhado/tipos';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAtendimentos } from '../api/consultas';
import { EstadoDaConsulta, Pagina } from '../componentes/Pagina';
import { SeloModo, SeloTriagem, Valor } from '../componentes/Selos';
import { type Coluna, Paginacao, Tabela, usePaginacao } from '../componentes/Tabela';

const COLUNAS: Coluna<AtendimentoResumo>[] = [
  { titulo: 'Data/hora', semQuebra: true, celula: (a) => dataHora(a.dataHora) },
  {
    titulo: 'Paciente',
    celula: (a) => (
      <Text size="sm" fw={600}>
        {a.pessoa.nome}
      </Text>
    ),
  },
  { titulo: 'Tipo', celula: (a) => rotulo(TIPO_OCORRENCIA, a.tipoOcorrencia) },
  { titulo: 'Triagem', semQuebra: true, celula: (a) => <SeloTriagem triagem={a.triagem} /> },
  {
    titulo: 'Desfecho',
    celula: (a) => (
      <Stack gap={0}>
        <Text size="sm">{rotulo(DESFECHO, a.desfecho.tipo)}</Text>
        {a.desfecho.destino && (
          <Text size="xs" c="dimmed">
            {a.desfecho.destino}
          </Text>
        )}
      </Stack>
    ),
  },
  {
    titulo: 'Profissional',
    celula: (a) => (
      <Stack gap={0}>
        <Text size="sm">{a.origem.criadoPorNome}</Text>
        <Text size="xs" c="dimmed">
          {a.origem.criadoPorRegistro}
        </Text>
      </Stack>
    ),
  },
  { titulo: 'Dispositivo', celula: (a) => <Valor vazio="—">{a.origem.dispositivoNome}</Valor> },
  { titulo: 'Modo', semQuebra: true, celula: (a) => <SeloModo modo={a.origem.modo} /> },
  { titulo: 'Recebido em', semQuebra: true, celula: (a) => dataHora(a.sincronizacao.recebidoEm) },
];

export function Atendimentos() {
  const consulta = useAtendimentos();
  const navegar = useNavigate();
  const [paciente, setPaciente] = useState('');
  const [periodo, setPeriodo] = useState<DatesRangeValue<string>>([null, null]);

  const filtrados = useMemo(() => {
    const busca = normalizar(paciente);
    const [de, ate] = periodo;
    return (consulta.data ?? []).filter((a) => {
      if (busca && !normalizar(a.pessoa.nome).includes(busca) && !(a.pessoa.cpf ?? '').includes(busca)) return false;
      const dia = diaEmBrasilia(a.dataHora);
      if (de && dia < de) return false;
      if (ate && dia > ate) return false;
      return true;
    });
  }, [consulta.data, paciente, periodo]);

  const { pagina, paginas, setPagina, itensDaPagina } = usePaginacao(filtrados, 20, [paciente, periodo]);

  return (
    <Pagina
      titulo="Atendimentos"
      descricao="Todas as fichas de atendimento recebidas pelo servidor, da mais recente para a mais antiga."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
    >
      <Card withBorder padding="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            label="Paciente"
            placeholder="Nome ou CPF"
            leftSection={<IconSearch size={16} />}
            value={paciente}
            onChange={(e) => setPaciente(e.currentTarget.value)}
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
        {() => (
          <Stack gap="sm">
            <Tabela
              itens={itensDaPagina}
              colunas={COLUNAS}
              chave={(a) => a.id}
              aoClicar={(a) => navegar(`/atendimentos/${a.id}`)}
              vazio="Nenhum atendimento encontrado."
              larguraMinima={1100}
            />
            <Paginacao pagina={pagina} paginas={paginas} total={filtrados.length} aoMudar={setPagina} />
          </Stack>
        )}
      </EstadoDaConsulta>
    </Pagina>
  );
}
