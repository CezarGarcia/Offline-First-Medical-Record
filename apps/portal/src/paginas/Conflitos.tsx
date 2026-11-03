import { Anchor, Badge, Card, Group, Stack, Table, Text } from '@mantine/core';
import { cpf, data, dataHora, telefone } from '@compartilhado/formatos';
import {
  CAMPO,
  ENTIDADE_DO_CONFLITO,
  ESTRATEGIA,
  MOTIVO_DO_CONFLITO,
  ORIGEM_DO_VALOR,
  SEXO,
  rotulo,
} from '@compartilhado/rotulos';
import type { Conflito, Sexo } from '@compartilhado/tipos';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useConflitos, useNomesDosProfissionais, useProntuarios } from '../api/consultas';
import { EstadoDaConsulta, Pagina } from '../componentes/Pagina';
import { IdCurto, Valor } from '../componentes/Selos';

/** O valor de uma diferença no mesmo formato do resto do portal (telefone, CPF, data, listas fixas). */
function valorDoCampo(campo: string, valor: string | null): string | null {
  if (valor === null) return null;
  if (campo === 'telefone' || campo === 'contato.telefone') return telefone(valor);
  if (campo === 'cpf') return cpf(valor);
  if (campo === 'dataNascimento') return data(valor);
  if (campo === 'sexo') return rotulo(SEXO, valor as Sexo);
  if (campo === 'tipoSanguineo') return valor === 'DESCONHECIDO' ? 'Desconhecido' : valor;
  return valor;
}

function CartaoDoConflito({
  conflito,
  nomes,
  pessoaDoProntuario,
}: {
  conflito: Conflito;
  nomes: Map<string, string>;
  pessoaDoProntuario: Map<string, string>;
}) {
  // O detalhe do prontuário é aberto pelo ID da pessoa
  const pessoaMantida = conflito.entidade === 'PESSOA' ? conflito.idMantido : pessoaDoProntuario.get(conflito.idMantido);
  return (
    <Card withBorder padding="lg">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="xs">
              <Badge variant="light">{rotulo(ENTIDADE_DO_CONFLITO, conflito.entidade)}</Badge>
              <Text fw={700}>{rotulo(MOTIVO_DO_CONFLITO, conflito.motivo)}</Text>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>
              Detectado em {dataHora(conflito.detectadoEm)} · regra: {rotulo(ESTRATEGIA, conflito.estrategia)}
            </Text>
          </div>
          {pessoaMantida && (
            <Anchor component={Link} to={`/prontuarios/${pessoaMantida}`} size="sm">
              Ver o registro mantido
            </Anchor>
          )}
        </Group>
        <Group gap="xl">
          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Registro mantido
            </Text>
            <IdCurto id={conflito.idMantido} />
          </div>
          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Registro descartado (vira apelido)
            </Text>
            <IdCurto id={conflito.idDescartado} />
          </div>
          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Veio do dispositivo
            </Text>
            <Text size="sm">
              <Valor vazio="—">{conflito.dispositivoNome}</Valor>
            </Text>
          </div>
          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Sincronizado por
            </Text>
            <Text size="sm">
              <Valor vazio="—">{conflito.sincronizadoPorId ? (nomes.get(conflito.sincronizadoPorId) ?? conflito.sincronizadoPorId) : null}</Valor>
            </Text>
          </div>
        </Group>
        {conflito.diferencas.length === 0 ? (
          <Text size="sm" c="dimmed">
            Os dois registros tinham os mesmos dados: nada a juntar.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={700}>
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Campo</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Valor que ficou</Table.Th>
                  <Table.Th>Valor que saiu</Table.Th>
                  <Table.Th>O valor que ficou veio</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {conflito.diferencas.map((d) => (
                  <Table.Tr key={d.campo}>
                    <Table.Td fw={600}>{CAMPO[d.campo] ?? d.campo}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={d.tipo === 'CONFLITO' ? 'orange' : 'teal'} size="sm">
                        {d.tipo === 'CONFLITO' ? 'Conflito' : 'Complemento'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Valor vazio="(vazio)">{valorDoCampo(d.campo, d.valorMantido)}</Valor>
                    </Table.Td>
                    <Table.Td>
                      <Valor vazio="(vazio)">{valorDoCampo(d.campo, d.valorDescartado)}</Valor>
                    </Table.Td>
                    <Table.Td>{rotulo(ORIGEM_DO_VALOR, d.origemDoValor)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </Card>
  );
}

export function Conflitos() {
  const consulta = useConflitos();
  const prontuarios = useProntuarios();
  const nomes = useNomesDosProfissionais();
  const pessoaDoProntuario = useMemo(
    () => new Map((prontuarios.data ?? []).map((p) => [p.id, p.pessoaId])),
    [prontuarios.data],
  );

  return (
    <Pagina
      titulo="Conflitos"
      descricao="Cada vez que o servidor recebeu um registro duplicado (mesmo CPF, ou segundo prontuário da mesma pessoa) e juntou os dois. Conflito: os dois tinham o campo preenchido com valores diferentes; complemento: só um tinha."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
    >
      <EstadoDaConsulta consulta={consulta}>
        {() =>
          (consulta.data ?? []).length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              Nenhum conflito até agora.
            </Text>
          ) : (
            <Stack gap="md">
              {(consulta.data ?? []).map((conflito) => (
                <CartaoDoConflito
                  key={conflito.id}
                  conflito={conflito}
                  nomes={nomes}
                  pessoaDoProntuario={pessoaDoProntuario}
                />
              ))}
            </Stack>
          )
        }
      </EstadoDaConsulta>
    </Pagina>
  );
}
