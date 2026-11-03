import { Card, Stack, Text } from '@mantine/core';
import { dataHora, numeroDaFicha } from '@compartilhado/formatos';
import { DESFECHO, TIPO_OCORRENCIA, rotulo } from '@compartilhado/rotulos';
import { useNavigate } from 'react-router';
import type { AtendimentoResumoLocal } from '../../../comum/contrato';
import { SeloModo, SeloSync, SeloTriagem } from './Basicos';
import { type Coluna, Paginacao, Tabela, usePaginacao } from './Tabela';

/** A lista de atendimentos do aparelho, do mais recente para o mais antigo (docs/10, seção 10.1). */
export function ListaDeAtendimentos({
  itens,
  comPaciente = true,
  filtro = null,
  vazio = 'Nenhum atendimento neste aparelho ainda.',
}: {
  itens: AtendimentoResumoLocal[];
  comPaciente?: boolean;
  filtro?: unknown;
  vazio?: string;
}) {
  const navegar = useNavigate();
  const paginacao = usePaginacao(itens, 20, filtro);
  const colunas: Coluna<AtendimentoResumoLocal>[] = [
    { titulo: 'Data/hora', celula: (a) => dataHora(a.dataHora), semQuebra: true },
    {
      titulo: 'Ficha',
      semQuebra: true,
      celula: (a) => (
        <Text size="sm" ff="monospace">
          {numeroDaFicha(a.id)}
        </Text>
      ),
    },
    ...(comPaciente ? [{ titulo: 'Paciente', celula: (a: AtendimentoResumoLocal) => <Text fw={600}>{a.pessoa.nome}</Text> }] : []),
    { titulo: 'Tipo', celula: (a) => rotulo(TIPO_OCORRENCIA, a.tipoOcorrencia), semQuebra: true },
    { titulo: 'Triagem', celula: (a) => <SeloTriagem triagem={a.triagem} />, semQuebra: true },
    { titulo: 'Desfecho', celula: (a) => rotulo(DESFECHO, a.desfecho.tipo) },
    {
      titulo: 'Registrado por',
      celula: (a) => (
        <Stack gap={0}>
          <Text size="sm">{a.origem.criadoPorNome}</Text>
          <Text size="xs" c="dimmed">
            {a.origem.dispositivoNome ?? 'Portal'}
          </Text>
        </Stack>
      ),
    },
    { titulo: 'Modo', celula: (a) => <SeloModo modo={a.origem.modo} />, semQuebra: true },
    { titulo: 'Sincronização', celula: (a) => <SeloSync estado={a.estadoSync} />, semQuebra: true },
  ];
  return (
    <Card withBorder radius="md" padding={0}>
      <Tabela
        itens={paginacao.itensDaPagina}
        colunas={colunas}
        chave={(a) => a.id}
        aoClicar={(a) => navegar(`/atendimentos/${a.id}`)}
        vazio={vazio}
        larguraMinima={comPaciente ? 1000 : 860}
      />
      {itens.length > 0 && (
        <Stack p="sm">
          <Paginacao pagina={paginacao.pagina} paginas={paginacao.paginas} total={itens.length} aoMudar={paginacao.setPagina} />
        </Stack>
      )}
    </Card>
  );
}
