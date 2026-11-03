import { Badge, Card, Code, Group, Select, Stack, Text, Tooltip } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { dataHora, dataHoraComSegundos, numeroDaFicha } from '@compartilhado/formatos';
import { eUuid } from '@compartilhado/ids';
import { ACAO_DO_CLIENTE, rotulo } from '@compartilhado/rotulos';
import { useMemo, useState } from 'react';
import type { LogLocal } from '../../../comum/contrato';
import { AvisoDeErro, Carregando, NAO_ENCOLHE, Pagina, SeloModo, Valor } from '../componentes/Basicos';
import { type Coluna, Paginacao, Tabela, usePaginacao } from '../componentes/Tabela';
import { nucleo } from '../nucleo';

/** IDs aparecem encurtados (os 8 últimos caracteres, como o número da ficha); o completo fica na dica. */
function detalhesEmTexto(detalhes: Record<string, unknown> | null): string | null {
  if (!detalhes || Object.keys(detalhes).length === 0) return null;
  return Object.entries(detalhes)
    .map(([chave, valor]) => {
      const texto = typeof valor === 'string' ? valor : JSON.stringify(valor);
      return `${chave}: ${typeof valor === 'string' && eUuid(valor) ? numeroDaFicha(valor) : texto}`;
    })
    .join(' · ');
}

/** As ações registradas neste aparelho (docs/08, seção 8.10). Sobem para o servidor em cada sincronização. */
export function Logs() {
  const [acao, setAcao] = useState<string | null>(null);
  const logs = useQuery({ queryKey: ['logs-locais'], queryFn: () => nucleo.logsLocais() });
  const itens = useMemo(() => (logs.data ?? []).filter((l) => !acao || l.acao === acao), [logs.data, acao]);
  const paginacao = usePaginacao(itens, 25, acao);
  const naoEnviados = (logs.data ?? []).filter((l) => !l.enviadoEm).length;

  const colunas: Coluna<LogLocal>[] = [
    { titulo: 'Data/hora', celula: (l) => dataHoraComSegundos(l.dataHora), semQuebra: true },
    {
      titulo: 'Profissional',
      celula: (l) => <Valor vazio={l.profissionalId ? l.profissionalId.slice(0, 8) : 'ninguém logado'}>{l.profissionalNome}</Valor>,
    },
    { titulo: 'Ação', celula: (l) => <Text size="sm" fw={600}>{rotulo(ACAO_DO_CLIENTE, l.acao)}</Text> },
    { titulo: 'Modo', celula: (l) => <SeloModo modo={l.modo} />, semQuebra: true },
    {
      titulo: 'Detalhes',
      celula: (l) => {
        const texto = detalhesEmTexto(l.detalhes);
        return texto ? (
          <Tooltip label={JSON.stringify(l.detalhes)} withArrow multiline maw={420}>
            <Code style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} fz="xs">
              {texto}
            </Code>
          </Tooltip>
        ) : (
          <Valor vazio="—">{null}</Valor>
        );
      },
    },
    {
      titulo: 'Enviado',
      semQuebra: true,
      celula: (l) =>
        l.enviadoEm ? (
          <Tooltip label={`Enviado em ${dataHora(l.enviadoEm)}`} withArrow>
            <Badge variant="light" color="teal" size="sm" styles={NAO_ENCOLHE}>
              Sim
            </Badge>
          </Tooltip>
        ) : (
          <Badge variant="light" color="orange" size="sm" styles={NAO_ENCOLHE}>
            Ainda não
          </Badge>
        ),
    },
  ];

  const acoes = Array.from(new Set((logs.data ?? []).map((l) => l.acao))).sort();
  return (
    <Pagina
      titulo="Logs locais"
      descricao="O que foi feito neste aparelho. Vai para o servidor no fim de cada sincronização (o administrador vê no Portal)."
    >
      <Group justify="space-between">
        <Select
          w={300}
          placeholder="Todas as ações"
          aria-label="Filtrar pela ação"
          data={acoes.map((a) => ({ value: a, label: rotulo(ACAO_DO_CLIENTE, a) ?? a }))}
          value={acao}
          onChange={setAcao}
          clearable
        />
        <Text size="sm" c="dimmed">
          {naoEnviados === 0 ? 'Todos já enviados ao servidor' : `${naoEnviados} ainda não enviado(s)`}
        </Text>
      </Group>
      {logs.isLoading ? (
        <Carregando />
      ) : logs.isError ? (
        <AvisoDeErro erro={logs.error} />
      ) : (
        <Card withBorder radius="md" padding={0}>
          <Tabela itens={paginacao.itensDaPagina} colunas={colunas} chave={(l) => l.id} larguraMinima={900} vazio="Nenhum registro." />
          {itens.length > 0 && (
            <Stack p="sm">
              <Paginacao pagina={paginacao.pagina} paginas={paginacao.paginas} total={itens.length} aoMudar={paginacao.setPagina} />
            </Stack>
          )}
        </Card>
      )}
    </Pagina>
  );
}
