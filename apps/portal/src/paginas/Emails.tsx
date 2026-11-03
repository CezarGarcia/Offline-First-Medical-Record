import { Anchor, Badge, Card, Stack, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { dataHora, numeroDaFicha } from '@compartilhado/formatos';
import { eUuid } from '@compartilhado/ids';
import { DESTINATARIO, rotulo } from '@compartilhado/rotulos';
import type { EnvioEmail } from '@compartilhado/tipos';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useEnviosDeEmail, useNomesDosProfissionais } from '../api/consultas';
import { EstadoDaConsulta, Pagina } from '../componentes/Pagina';
import { IdCurto, Valor } from '../componentes/Selos';
import { type Coluna, Paginacao, Tabela } from '../componentes/Tabela';

const TAMANHO_DA_PAGINA = 50;

export function Emails() {
  const nomes = useNomesDosProfissionais();
  const [parametros, setParametros] = useSearchParams();
  const [atendimento, setAtendimento] = useState(parametros.get('atendimentoId') ?? '');
  const [pagina, setPagina] = useState(1);
  const atendimentoValido = !atendimento.trim() || eUuid(atendimento);
  const atendimentoId = atendimento.trim() && eUuid(atendimento) ? atendimento.trim() : null;
  const consulta = useEnviosDeEmail({ atendimentoId, pagina, tamanho: TAMANHO_DA_PAGINA });

  useEffect(() => {
    setPagina(1);
    setParametros(atendimentoId ? { atendimentoId } : {}, { replace: true });
  }, [atendimentoId, setParametros]);

  const colunas: Coluna<EnvioEmail>[] = [
    { titulo: 'Pedido em', semQuebra: true, celula: (e) => dataHora(e.solicitadoEm) },
    {
      titulo: 'Atendimento',
      celula: (e) => (
        <Anchor component={Link} to={`/atendimentos/${e.atendimentoId}`} size="sm">
          Ficha Nº {numeroDaFicha(e.atendimentoId)}
        </Anchor>
      ),
    },
    {
      titulo: 'Destinatário',
      celula: (e) => (
        <Stack gap={0}>
          <Text size="sm">{e.destinatarioEmail}</Text>
          <Text size="xs" c="dimmed">
            {rotulo(DESTINATARIO, e.destinatarioTipo)}
          </Text>
        </Stack>
      ),
    },
    {
      titulo: 'Status',
      celula: (e) => (
        <Badge variant="light" color={e.status === 'ENVIADO' ? 'teal' : 'red'} size="sm">
          {e.status === 'ENVIADO' ? 'Enviado' : 'Erro'}
        </Badge>
      ),
    },
    { titulo: 'Tentativas', celula: (e) => e.tentativas },
    {
      titulo: 'Erro',
      celula: (e) => (
        <Text size="sm" c={e.erro ? 'red.8' : undefined}>
          <Valor vazio="—">{e.erro}</Valor>
        </Text>
      ),
    },
    { titulo: 'Quem pediu', celula: (e) => nomes.get(e.solicitadoPorId) ?? e.solicitadoPorId },
    { titulo: 'Enviado em', semQuebra: true, celula: (e) => <Valor vazio="—">{dataHora(e.enviadoEm)}</Valor> },
    { titulo: 'Pedido', celula: (e) => <IdCurto id={e.id} /> },
  ];

  return (
    <Pagina
      titulo="E-mails enviados"
      descricao="Cada pedido de envio da ficha por e-mail, com o resultado. O mesmo pedido nunca manda dois e-mails; um pedido com erro pode ser repetido pelo cliente."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
    >
      <Card withBorder padding="md">
        <TextInput
          label="ID do atendimento"
          placeholder="Todos os atendimentos"
          leftSection={<IconSearch size={16} />}
          value={atendimento}
          onChange={(e) => setAtendimento(e.currentTarget.value)}
          error={atendimentoValido ? undefined : 'Cole o ID completo do atendimento (UUID)'}
        />
      </Card>
      <EstadoDaConsulta consulta={consulta}>
        {() => {
          const dados = consulta.data;
          if (!dados) return null;
          return (
            <Stack gap="sm">
              <Tabela itens={dados.itens} colunas={colunas} chave={(e) => e.id} vazio="Nenhum e-mail enviado ainda." larguraMinima={1200} />
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
