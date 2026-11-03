/**
 * A fila de sincronização (outbox, docs/07): cada cadastro e cada pedido de e-mail feito no aparelho, na ordem
 * em que vai para o servidor. É a melhor tela para mostrar o offline-first na apresentação (docs/10, seção 10.1).
 */
import { Button, Card, Group, SegmentedControl, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRefresh } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { dataHora } from '@compartilhado/formatos';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { ItemDaFila, StatusItemDaFila, TipoItemDaFila } from '../../../comum/contrato';
import { AvisoDeErro, Carregando, Pagina, SeloStatusDaFila, Valor } from '../componentes/Basicos';
import { type Coluna, Paginacao, Tabela, usePaginacao } from '../componentes/Tabela';
import { mensagemDoErro, nucleo, useEstadoDoApp } from '../nucleo';

const TIPO: Record<TipoItemDaFila, string> = {
  CRIAR_PESSOA: 'Cadastro de pessoa',
  CRIAR_PRONTUARIO: 'Cadastro de prontuário',
  CRIAR_ATENDIMENTO: 'Registro de atendimento',
  ENVIAR_EMAIL: 'Envio de e-mail',
};

type Filtro = 'TODOS' | 'ABERTOS' | StatusItemDaFila;

function destino(item: ItemDaFila): string | null {
  if (item.tipo === 'CRIAR_PESSOA') return `/pacientes/${item.entidadeId}`;
  if (item.tipo === 'CRIAR_ATENDIMENTO' || item.tipo === 'ENVIAR_EMAIL') return `/atendimentos/${item.entidadeId}`;
  return null;
}

export function Fila() {
  const estado = useEstadoDoApp();
  const navegar = useNavigate();
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [tentando, setTentando] = useState<string | null>(null);
  const fila = useQuery({ queryKey: ['fila'], queryFn: () => nucleo.fila(), refetchInterval: 3000 });

  const itens = useMemo(
    () =>
      (fila.data ?? []).filter((item) =>
        filtro === 'TODOS' ? true : filtro === 'ABERTOS' ? item.status !== 'CONCLUIDO' : item.status === filtro,
      ),
    [fila.data, filtro],
  );
  const paginacao = usePaginacao(itens, 25, filtro);

  async function tentarDeNovo(item: ItemDaFila) {
    setTentando(item.id);
    try {
      await nucleo.tentarDeNovo(item.id);
      notifications.show({
        color: 'blue',
        title: 'De volta à fila',
        message: estado?.conectividade === 'OFFLINE' ? 'Sai quando a chave voltar para Online.' : 'Enviando de novo…',
      });
      await fila.refetch();
    } catch (erro) {
      notifications.show({ color: 'red', title: 'Não foi possível', message: mensagemDoErro(erro) });
    } finally {
      setTentando(null);
    }
  }

  const colunas: Coluna<ItemDaFila>[] = [
    {
      titulo: '#',
      largura: 56,
      celula: (i) => (
        <Text size="sm" c="dimmed">
          {i.ordem}
        </Text>
      ),
    },
    { titulo: 'Tipo', celula: (i) => TIPO[i.tipo] ?? i.tipo, semQuebra: true },
    {
      titulo: 'Registro',
      celula: (i) => {
        const caminho = destino(i);
        return caminho ? (
          <Text size="sm" fw={600} c="marca.7" style={{ cursor: 'pointer' }} onClick={() => navegar(caminho)}>
            {i.descricao}
          </Text>
        ) : (
          <Text size="sm" fw={600}>
            {i.descricao}
          </Text>
        );
      },
    },
    {
      titulo: 'Status',
      semQuebra: true,
      celula: (i) => (
        <Stack gap={2} align="flex-start">
          <SeloStatusDaFila status={i.status} />
          <Text size="xs" c="dimmed">
            {i.tentativas === 1 ? '1 tentativa' : `${i.tentativas} tentativas`}
          </Text>
        </Stack>
      ),
    },
    {
      titulo: 'Último erro',
      celula: (i) =>
        i.ultimoErro || (i.status === 'PENDENTE' && i.proximaTentativaEm) ? (
          <Stack gap={2}>
            {i.ultimoErro && (
              <Text size="sm" c={i.status === 'ERRO' ? 'red.7' : 'orange.8'} style={{ overflowWrap: 'anywhere' }}>
                {i.ultimoErro}
              </Text>
            )}
            {i.status === 'PENDENTE' && i.proximaTentativaEm && (
              <Text size="xs" c="dimmed">
                Próxima tentativa: {dataHora(i.proximaTentativaEm)}
              </Text>
            )}
          </Stack>
        ) : (
          <Valor vazio="—">{null}</Valor>
        ),
    },
    {
      titulo: 'Criado / concluído',
      semQuebra: true,
      celula: (i) => (
        <Stack gap={0}>
          <Text size="sm">{dataHora(i.criadoEm)}</Text>
          {i.concluidoEm && (
            <Text size="xs" c="dimmed">
              {dataHora(i.concluidoEm)}
            </Text>
          )}
        </Stack>
      ),
    },
    {
      titulo: '',
      largura: 130,
      celula: (i) =>
        i.status === 'ERRO' ? (
          <Button size="xs" variant="light" color="red" leftSection={<IconRefresh size={14} />} loading={tentando === i.id} onClick={() => tentarDeNovo(i)}>
            Tentar de novo
          </Button>
        ) : null,
    },
  ];

  return (
    <Pagina
      titulo="Fila de sincronização"
      descricao="O que foi feito neste aparelho, na ordem em que vai para o servidor. Com a chave em Offline, tudo espera aqui."
    >
      <Group justify="space-between">
        <SegmentedControl
          aria-label="Filtrar a fila"
          value={filtro}
          onChange={(valor) => setFiltro(valor as Filtro)}
          data={[
            { value: 'TODOS', label: 'Todos' },
            { value: 'ABERTOS', label: 'A enviar' },
            { value: 'CONCLUIDO', label: 'Concluídos' },
            { value: 'ERRO', label: 'Com erro' },
          ]}
        />
        <Text size="sm" c="dimmed">
          {estado?.pendentes === 1 ? '1 item a enviar' : `${estado?.pendentes ?? 0} itens a enviar`}
          {estado?.itensComErro ? ` · ${estado.itensComErro} com erro` : ''}
        </Text>
      </Group>
      {fila.isLoading ? (
        <Carregando />
      ) : fila.isError ? (
        <AvisoDeErro erro={fila.error} />
      ) : (
        <Card withBorder radius="md" padding={0}>
          <Tabela
            itens={paginacao.itensDaPagina}
            colunas={colunas}
            chave={(i) => i.id}
            larguraMinima={900}
            vazio={filtro === 'TODOS' ? 'A fila está vazia: nada foi feito neste aparelho ainda.' : 'Nenhum item com esse filtro.'}
          />
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
