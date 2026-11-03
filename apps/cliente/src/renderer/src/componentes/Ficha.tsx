/**
 * A ficha do atendimento na tela, na mesma ordem do PDF (docs/09-ficha-e-dominio.md, seção 9.5). Igual à do
 * Portal Admin, mas com os registros do banco local: o que ainda não subiu aparece como "Pendente".
 */
import { Alert, Group, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { cpf, data, dataHora, diaEmBrasilia, gravidadeGlasgow, hora, idade, numero, telefone } from '@compartilhado/formatos';
import {
  DESFECHO,
  GLASGOW_MOTORA,
  GLASGOW_OCULAR,
  GLASGOW_VERBAL,
  PROTOCOLO,
  SEXO,
  SIGNIFICADO_DA_COR,
  TIPO_OCORRENCIA,
  UNIDADE,
  VIA,
  rotulo,
} from '@compartilhado/rotulos';
import type { Contato, Origem, Sincronizacao } from '@compartilhado/tipos';
import type { ReactNode } from 'react';
import type { AtendimentoDetalheLocal, EstadoSync, PessoaLocal, ProntuarioLocal } from '../../../comum/contrato';
import { Campos, Secao, SeloModo, SeloSync, SeloTriagem, Valor } from './Basicos';

export function textoDoContato(contato: Contato | null): string | null {
  if (!contato) return null;
  const nome = contato.nome && contato.parentesco ? `${contato.nome} (${contato.parentesco})` : contato.nome;
  const partes = [nome, telefone(contato.telefone), contato.email].filter(Boolean);
  return partes.length ? partes.join(' · ') : null;
}

export function SecaoPaciente({ pessoa, referencia, acoes }: { pessoa: PessoaLocal; referencia: string; acoes?: ReactNode }) {
  const anos = idade(pessoa.dataNascimento, referencia);
  const nascimento = pessoa.dataNascimento
    ? `${data(pessoa.dataNascimento)}${anos !== null ? ` (${anos} ${anos === 1 ? 'ano' : 'anos'})` : ''}`
    : null;
  return (
    <Secao titulo="Paciente" acoes={acoes ?? <SeloSync estado={pessoa.estadoSync} />}>
      <Campos
        campos={[
          { rotulo: 'Nome', valor: pessoa.nome, largo: true, destaque: true },
          { rotulo: 'CPF', valor: cpf(pessoa.cpf) },
          { rotulo: 'Data de nascimento', valor: nascimento },
          { rotulo: 'Sexo', valor: rotulo(SEXO, pessoa.sexo) },
          { rotulo: 'Telefone', valor: telefone(pessoa.telefone) },
          { rotulo: 'E-mail', valor: pessoa.email },
          { rotulo: 'Contato do familiar', valor: textoDoContato(pessoa.contato), largo: true },
        ]}
      />
    </Secao>
  );
}

/** As alergias em destaque: é o que mais importa antes de medicar. */
export function AvisoDeAlergias({ prontuario }: { prontuario: ProntuarioLocal | null | undefined }) {
  if (!prontuario?.alergias) return null;
  return (
    <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title="Alergias">
      {prontuario.alergias}
    </Alert>
  );
}

export function SecaoProntuario({ prontuario, acoes }: { prontuario: ProntuarioLocal; acoes?: ReactNode }) {
  return (
    <Secao titulo="Prontuário" acoes={acoes ?? <SeloSync estado={prontuario.estadoSync} />}>
      <Campos
        campos={[
          {
            rotulo: 'Tipo sanguíneo',
            valor: prontuario.tipoSanguineo === 'DESCONHECIDO' ? 'Desconhecido' : prontuario.tipoSanguineo,
          },
          {
            rotulo: 'Alergias',
            valor: prontuario.alergias ? (
              <Text span c="red.8" fw={700} size="sm">
                {prontuario.alergias}
              </Text>
            ) : null,
          },
          { rotulo: 'Comorbidades', valor: prontuario.comorbidades },
          { rotulo: 'Medicamentos de uso contínuo', valor: prontuario.medicamentosUsoContinuo, largo: true },
          ...(prontuario.observacoes ? [{ rotulo: 'Observações', valor: prontuario.observacoes, largo: true }] : []),
        ]}
      />
    </Secao>
  );
}

export function SecaoOrigem({
  origem,
  sincronizacao,
  estadoSync,
}: {
  origem: Origem;
  sincronizacao: Sincronizacao | null;
  estadoSync: EstadoSync;
}) {
  return (
    <Secao titulo="Origem e sincronização" acoes={<SeloSync estado={estadoSync} />}>
      <Campos
        campos={[
          { rotulo: 'Registrado por', valor: `${origem.criadoPorNome} (${origem.criadoPorRegistro})`, destaque: true },
          { rotulo: 'Dispositivo', valor: origem.dispositivoNome },
          { rotulo: 'Modo de registro', valor: <SeloModo modo={origem.modo} /> },
          { rotulo: 'Registrado no dispositivo em', valor: dataHora(origem.criadoEm) },
          {
            rotulo: 'Recebido pelo servidor em',
            valor: sincronizacao ? dataHora(sincronizacao.recebidoEm) : (
              <Valor vazio={estadoSync === 'ERRO' ? 'o servidor recusou (veja a fila)' : 'ainda não chegou ao servidor'}>{null}</Valor>
            ),
          },
        ]}
      />
    </Secao>
  );
}

export function FichaDoAtendimento({ atendimento }: { atendimento: AtendimentoDetalheLocal }) {
  const referencia = diaEmBrasilia(atendimento.dataHora);
  const significado = SIGNIFICADO_DA_COR[atendimento.triagem.protocolo]?.[atendimento.triagem.cor];
  const glasgow = atendimento.glasgow;
  const sinais = atendimento.sinaisVitais;
  const comUnidade = (valor: number | null | undefined, unidade: string) =>
    valor === null || valor === undefined ? null : `${numero(valor)} ${unidade}`;
  const pressao =
    sinais && (sinais.paSistolica !== null || sinais.paDiastolica !== null)
      ? `${numero(sinais.paSistolica) ?? '—'} × ${numero(sinais.paDiastolica) ?? '—'} mmHg`
      : null;

  return (
    <Stack gap="md">
      <SecaoPaciente pessoa={atendimento.pessoa} referencia={referencia} />
      <SecaoProntuario prontuario={atendimento.prontuario} />

      <Secao titulo="Ocorrência">
        <Campos
          campos={[
            { rotulo: 'Data/hora', valor: dataHora(atendimento.dataHora) },
            { rotulo: 'Tipo de ocorrência', valor: rotulo(TIPO_OCORRENCIA, atendimento.tipoOcorrencia) },
            { rotulo: 'Local', valor: atendimento.localOcorrencia },
            { rotulo: 'Queixa principal', valor: atendimento.queixaPrincipal, largo: true, destaque: true },
          ]}
        />
      </Secao>

      <Secao titulo="Triagem">
        <Group gap="md">
          <SeloTriagem triagem={atendimento.triagem} grande />
          <div>
            <Text fw={700}>Protocolo {rotulo(PROTOCOLO, atendimento.triagem.protocolo)}</Text>
            {significado && (
              <Text size="sm" c="dimmed">
                {significado}
              </Text>
            )}
          </div>
        </Group>
      </Secao>

      <Secao titulo="Avaliação">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <div>
            <Text fw={600} size="sm" mb={4}>
              Escala de Glasgow
            </Text>
            {glasgow ? (
              <Table withRowBorders>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td c="dimmed">Abertura ocular</Table.Td>
                    <Table.Td fw={700}>{glasgow.ocular}</Table.Td>
                    <Table.Td>{GLASGOW_OCULAR[glasgow.ocular]}</Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td c="dimmed">Resposta verbal</Table.Td>
                    <Table.Td fw={700}>{glasgow.verbal}</Table.Td>
                    <Table.Td>{GLASGOW_VERBAL[glasgow.verbal]}</Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td c="dimmed">Resposta motora</Table.Td>
                    <Table.Td fw={700}>{glasgow.motora}</Table.Td>
                    <Table.Td>{GLASGOW_MOTORA[glasgow.motora]}</Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td fw={700}>Total</Table.Td>
                    <Table.Td fw={700}>{glasgow.total}</Table.Td>
                    <Table.Td fw={700}>{gravidadeGlasgow(glasgow.total)}</Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            ) : (
              <Valor vazio="Não avaliada.">{null}</Valor>
            )}
          </div>
          <div>
            <Text fw={600} size="sm" mb={4}>
              Sinais vitais
            </Text>
            <Table withRowBorders>
              <Table.Tbody>
                {(
                  [
                    ['Pressão arterial', pressao],
                    ['Frequência cardíaca', comUnidade(sinais?.frequenciaCardiaca, 'bpm')],
                    ['Frequência respiratória', comUnidade(sinais?.frequenciaRespiratoria, 'irpm')],
                    ['Saturação de O₂ (SpO₂)', comUnidade(sinais?.spo2, '%')],
                    ['Temperatura', comUnidade(sinais?.temperatura, '°C')],
                    ['Glicemia capilar', comUnidade(sinais?.glicemia, 'mg/dL')],
                  ] as const
                ).map(([sinal, valor]) => (
                  <Table.Tr key={sinal}>
                    <Table.Td c="dimmed">{sinal}</Table.Td>
                    <Table.Td>
                      <Valor vazio="não medido">{valor}</Valor>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        </SimpleGrid>
      </Secao>

      <Secao titulo="Medicamentos administrados">
        {atendimento.medicamentos.length === 0 ? (
          <Valor vazio="Nenhum medicamento administrado.">{null}</Valor>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Medicamento</Table.Th>
                  <Table.Th>Dose</Table.Th>
                  <Table.Th>Via</Table.Th>
                  <Table.Th>Horário</Table.Th>
                  <Table.Th>Observação</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {[...atendimento.medicamentos]
                  .sort((a, b) => a.horario.localeCompare(b.horario))
                  .map((item) => (
                    <Table.Tr key={item.id}>
                      <Table.Td fw={600}>{item.nome || 'Medicamento do catálogo'}</Table.Td>
                      <Table.Td>
                        {numero(item.dose)} {rotulo(UNIDADE, item.unidade)}
                      </Table.Td>
                      <Table.Td>{rotulo(VIA, item.via)}</Table.Td>
                      <Table.Td>{diaEmBrasilia(item.horario) === referencia ? hora(item.horario) : dataHora(item.horario)}</Table.Td>
                      <Table.Td>
                        <Valor vazio="—">{item.observacao}</Valor>
                      </Table.Td>
                    </Table.Tr>
                  ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Secao>

      <Secao titulo="Procedimentos e desfecho">
        <Campos
          campos={[
            { rotulo: 'Desfecho', valor: rotulo(DESFECHO, atendimento.desfecho.tipo), destaque: true },
            ...(atendimento.desfecho.destino ? [{ rotulo: 'Destino', valor: atendimento.desfecho.destino }] : []),
            { rotulo: 'Procedimentos realizados', valor: atendimento.procedimentos, largo: true },
            ...(atendimento.observacoes ? [{ rotulo: 'Observações', valor: atendimento.observacoes, largo: true }] : []),
          ]}
        />
      </Secao>

      <SecaoOrigem origem={atendimento.origem} sincronizacao={atendimento.sincronizacao} estadoSync={atendimento.estadoSync} />
    </Stack>
  );
}
