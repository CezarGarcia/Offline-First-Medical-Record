import { Alert, Button, Card, Group, Table, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconArrowLeft, IconClockHour4, IconFileTypePdf, IconMail } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { dataHora, numeroDaFicha } from '@compartilhado/formatos';
import { DESTINATARIO, rotulo } from '@compartilhado/rotulos';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { AtendimentoDetalheLocal, EstadoSync, PedidoDeEmailLocal } from '../../../comum/contrato';
import { AvisoDeErro, Carregando, Pagina, Secao, SeloStatusDaFila, Valor } from '../componentes/Basicos';
import { FichaDoAtendimento } from '../componentes/Ficha';
import { JanelaEmail } from '../componentes/JanelaEmail';
import { mensagemDoErro, nucleo, useEstadoDoApp } from '../nucleo';

export function Atendimento() {
  const { id = '' } = useParams();
  const detalhe = useQuery({ queryKey: ['atendimento', id], queryFn: () => nucleo.atendimento(id) });
  const atendimento = detalhe.data;
  useAvisoDeEnviado(atendimento?.estadoSync);

  if (detalhe.isLoading) return <Carregando />;
  if (detalhe.isError) return <AvisoDeErro erro={detalhe.error} />;
  if (!atendimento) {
    return (
      <Pagina titulo="Atendimento">
        <Alert color="orange" variant="light" title="Atendimento não encontrado neste aparelho" />
        <Button component={Link} to="/atendimentos" variant="default" leftSection={<IconArrowLeft size={16} />} w="fit-content">
          Voltar para Atendimentos
        </Button>
      </Pagina>
    );
  }
  return <DetalheDoAtendimento atendimento={atendimento} />;
}

/** "Salvo no aparelho" e, se online, "enviado" logo depois (docs/10, seção 10.1). */
function useAvisoDeEnviado(estadoSync: EstadoSync | undefined) {
  const anterior = useRef<EstadoSync | undefined>(undefined);
  useEffect(() => {
    if (anterior.current === 'PENDENTE' && estadoSync === 'SINCRONIZADO') {
      notifications.show({ color: 'teal', title: 'Enviado', message: 'O servidor recebeu este atendimento.' });
    }
    anterior.current = estadoSync;
  }, [estadoSync]);
}

function DetalheDoAtendimento({ atendimento }: { atendimento: AtendimentoDetalheLocal }) {
  const estado = useEstadoDoApp();
  const [emailAberto, janelaDeEmail] = useDisclosure(false);
  const [baixando, setBaixando] = useState(false);
  const offline = estado?.conectividade === 'OFFLINE';
  const sincronizado = atendimento.estadoSync === 'SINCRONIZADO';
  const precisaLogin = Boolean(estado?.sessao?.precisaLoginOnline);
  const motivoSemPdf = !sincronizado
    ? 'Disponível depois de sincronizar (o PDF é gerado no servidor).'
    : offline
      ? 'Para baixar o PDF, a chave precisa estar em Online.'
      : precisaLogin
        ? 'Entre online para baixar o PDF.'
        : null;

  async function baixarPdf() {
    setBaixando(true);
    try {
      const resultado = await nucleo.baixarPdf(atendimento.id);
      if (resultado) notifications.show({ color: 'teal', title: 'PDF salvo', message: resultado.salvoEm });
    } catch (erro) {
      notifications.show({ color: 'red', title: 'Não foi possível baixar o PDF', message: mensagemDoErro(erro) });
    } finally {
      setBaixando(false);
    }
  }

  return (
    <Pagina
      titulo={`Ficha Nº ${numeroDaFicha(atendimento.id)}`}
      descricao={`${atendimento.pessoa.nome} · ${dataHora(atendimento.dataHora)}`}
      acoes={
        <>
          <Button component={Link} to="/atendimentos" variant="default" leftSection={<IconArrowLeft size={16} />}>
            Atendimentos
          </Button>
          <Tooltip label={motivoSemPdf} disabled={!motivoSemPdf} withArrow multiline w={260}>
            {/* O span deixa a dica aparecer mesmo com o botão desabilitado */}
            <span>
              <Button
                variant="light"
                leftSection={<IconFileTypePdf size={16} />}
                onClick={baixarPdf}
                loading={baixando}
                disabled={Boolean(motivoSemPdf)}
              >
                Baixar PDF
              </Button>
            </span>
          </Tooltip>
          <Tooltip label="O servidor recusou este atendimento: veja a fila" disabled={atendimento.estadoSync !== 'ERRO'} withArrow>
            <span>
              <Button leftSection={<IconMail size={16} />} onClick={janelaDeEmail.open} disabled={atendimento.estadoSync === 'ERRO'}>
                Enviar por e-mail
              </Button>
            </span>
          </Tooltip>
        </>
      }
    >
      {atendimento.estadoSync === 'PENDENTE' && (
        <Alert color="orange" variant="light" icon={<IconClockHour4 size={18} />}>
          Salvo neste aparelho; vai para o servidor na próxima sincronização. O PDF fica disponível depois disso.
        </Alert>
      )}
      {atendimento.estadoSync === 'ERRO' && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />}>
          <Group justify="space-between">
            <span>O servidor recusou este atendimento. O motivo está na fila de sincronização.</span>
            <Button size="xs" color="red" variant="light" component={Link} to="/fila">
              Ver a fila
            </Button>
          </Group>
        </Alert>
      )}
      {atendimento.emails.length > 0 && <EmailsDaFicha pedidos={atendimento.emails} />}
      <FichaDoAtendimento atendimento={atendimento} />
      <JanelaEmail atendimento={atendimento} aberta={emailAberto} aoFechar={janelaDeEmail.close} />
    </Pagina>
  );
}

function para(pedido: PedidoDeEmailLocal): string {
  if (pedido.resultado) return pedido.resultado.destinatarioEmail;
  if (pedido.destinatario.tipo === 'OUTRO') return pedido.destinatario.email ?? '';
  return rotulo(DESTINATARIO, pedido.destinatario.tipo) ?? pedido.destinatario.tipo;
}

/** Os pedidos de e-mail desta ficha, com o que aconteceu com cada um. */
function EmailsDaFicha({ pedidos }: { pedidos: PedidoDeEmailLocal[] }) {
  return (
    <Secao titulo="E-mails desta ficha">
      <Card withBorder padding={0} radius="sm">
        <Table.ScrollContainer minWidth={640}>
          <Table striped verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Pedido em</Table.Th>
                <Table.Th>Para</Table.Th>
                <Table.Th>Na fila</Table.Th>
                <Table.Th>Resultado</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pedidos.map((pedido) => (
                <Table.Tr key={pedido.id}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{dataHora(pedido.criadoEm)}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{para(pedido)}</Text>
                    <Text size="xs" c="dimmed">
                      {rotulo(DESTINATARIO, pedido.destinatario.tipo)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <SeloStatusDaFila status={pedido.status} />
                  </Table.Td>
                  <Table.Td>
                    {pedido.resultado?.status === 'ENVIADO' ? (
                      <Text size="sm" c="teal.8">
                        {pedido.resultado.enviadoEm ? `Enviado em ${dataHora(pedido.resultado.enviadoEm)}` : 'Enviado'}
                      </Text>
                    ) : pedido.ultimoErro ? (
                      <Text size="sm" c="red.7">
                        {pedido.ultimoErro}
                      </Text>
                    ) : (
                      <Valor vazio={pedido.status === 'PENDENTE' ? 'aguardando a conexão' : 'enviando…'}>{null}</Valor>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Secao>
  );
}
