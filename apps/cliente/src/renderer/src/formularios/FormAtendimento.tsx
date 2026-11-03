/**
 * A ficha do atendimento (docs/09-ficha-e-dominio.md, seção 9.4): ocorrência, triagem, Glasgow, sinais vitais,
 * medicamentos administrados e desfecho. As regras são as mesmas do servidor (@compartilhado/validacao): o app
 * confere antes de salvar, para nada inválido ficar parado na fila. Datas e horas no horário de Brasília (D-23).
 */
import {
  ActionIcon,
  Alert,
  Button,
  Grid,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { IconAlertTriangle, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { gravidadeGlasgow } from '@compartilhado/formatos';
import {
  COR,
  COR_HEX,
  DESFECHO,
  GLASGOW_MOTORA,
  GLASGOW_OCULAR,
  GLASGOW_VERBAL,
  PROTOCOLO,
  SIGNIFICADO_DA_COR,
  TIPO_OCORRENCIA,
  UNIDADE,
  VIA,
} from '@compartilhado/rotulos';
import type { CorTriagem, Medicamento, Protocolo, TipoDesfecho, TipoOcorrencia, Unidade, Via } from '@compartilhado/tipos';
import { CORES_POR_PROTOCOLO, DESFECHOS, TIPOS_OCORRENCIA, UNIDADES, VIAS, validarAtendimento } from '@compartilhado/validacao';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { AtendimentoLocal } from '../../../comum/contrato';
import { Secao } from '../componentes/Basicos';
import { errosPorCampo, mensagemDoErro, nucleo } from '../nucleo';
import {
  type FormularioDoAtendimento,
  type LinhaDeMedicamento,
  SINAIS,
  type SinalVital,
  agoraEmBrasilia,
  formularioVazio,
  paraDados,
} from './dadosDoAtendimento';

const opcoesGlasgow = (tabela: Record<number, string>) =>
  Object.entries(tabela)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([valor, texto]) => ({ value: valor, label: `${valor} · ${texto}` }));

/** Os nomes dos erros (os da API) de cada campo do formulário. */
const ERROS_DO_CAMPO: Partial<Record<keyof FormularioDoAtendimento, string[]>> = {
  protocolo: ['triagem.protocolo', 'triagem.cor'],
  cor: ['triagem.cor'],
  glasgow: ['glasgow'],
  desfecho: ['desfecho.tipo', 'desfecho.destino'],
  destino: ['desfecho.destino'],
};

function rotuloDoMedicamento(m: Medicamento): string {
  return m.apresentacao ? `${m.nome} (${m.apresentacao})` : m.nome;
}

/** Os botões das cores da triagem, com o significado de cada uma no protocolo escolhido. */
function EscolhaDaCor({
  protocolo,
  cor,
  erro,
  aoMudar,
}: {
  protocolo: Protocolo | null;
  cor: CorTriagem | null;
  erro?: string;
  aoMudar: (cor: CorTriagem) => void;
}) {
  if (!protocolo) return null;
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500} id="rotulo-cor">
        Cor da triagem <span style={{ color: 'var(--mantine-color-error)' }}>*</span>
      </Text>
      <SimpleGrid cols={{ base: 2, sm: CORES_POR_PROTOCOLO[protocolo].length }} spacing="xs" role="radiogroup" aria-labelledby="rotulo-cor">
        {CORES_POR_PROTOCOLO[protocolo].map((opcao) => {
          const escolhida = opcao === cor;
          const cores = COR_HEX[opcao];
          return (
            <UnstyledButton
              key={opcao}
              role="radio"
              aria-checked={escolhida}
              aria-label={COR[opcao]}
              onClick={() => aoMudar(opcao)}
              style={{
                backgroundColor: cores.fundo,
                color: cores.texto,
                borderRadius: 8,
                padding: '10px 12px',
                outline: escolhida ? '3px solid var(--mantine-color-dark-7)' : 'none',
                outlineOffset: 2,
                opacity: cor && !escolhida ? 0.55 : 1,
              }}
            >
              <Text fw={800} size="sm" c="inherit">
                {COR[opcao]}
              </Text>
              <Text size="xs" c="inherit" lh={1.25}>
                {SIGNIFICADO_DA_COR[protocolo][opcao]}
              </Text>
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
      {erro && (
        <Text size="xs" c="red.7" data-campo-com-erro>
          {erro}
        </Text>
      )}
    </Stack>
  );
}

interface Props {
  prontuarioId: string;
  aoSalvar: (atendimento: AtendimentoLocal) => void;
}

export function FormAtendimento({ prontuarioId, aoSalvar }: Props) {
  const [f, setF] = useState<FormularioDoAtendimento>(formularioVazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [tentativas, setTentativas] = useState(0);
  const proximaChave = useRef(1);
  const catalogo = useQuery({ queryKey: ['medicamentos-ativos'], queryFn: () => nucleo.medicamentosAtivos() });
  const medicamentos = catalogo.data ?? [];

  // Depois de uma tentativa com erro, a tela rola até o primeiro campo marcado
  useEffect(() => {
    if (!tentativas) return;
    requestAnimationFrame(() => {
      document.querySelector('[aria-invalid="true"], [data-campo-com-erro]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [tentativas]);

  /** O erro de um campo some assim que ele muda (volta a ser conferido ao salvar). */
  const limparErros = (...campos: string[]) =>
    setErros((atuais) => (campos.some((c) => c in atuais) ? Object.fromEntries(Object.entries(atuais).filter(([c]) => !campos.includes(c))) : atuais));

  const mudar = <K extends keyof FormularioDoAtendimento>(campo: K, valor: FormularioDoAtendimento[K]) => {
    setF((atual) => ({ ...atual, [campo]: valor }));
    limparErros(...(ERROS_DO_CAMPO[campo] ?? [campo]));
  };

  function mudarSinal(campo: SinalVital, valor: number | string) {
    setF((atual) => ({ ...atual, sinais: { ...atual.sinais, [campo]: valor } }));
    limparErros(`sinaisVitais.${campo}`);
  }

  function mudarMedicamento(chave: number, mudancas: Partial<LinhaDeMedicamento>) {
    const indice = f.medicamentos.findIndex((m) => m.chave === chave);
    setF((atual) => ({ ...atual, medicamentos: atual.medicamentos.map((m) => (m.chave === chave ? { ...m, ...mudancas } : m)) }));
    limparErros(...Object.keys(mudancas).map((campo) => `medicamentos.${indice}.${campo}`), 'medicamentos');
  }

  function adicionarMedicamento() {
    const chave = proximaChave.current++;
    setF((atual) => ({
      ...atual,
      medicamentos: [
        ...atual.medicamentos,
        { chave, medicamentoId: null, dose: '', unidade: null, via: null, horario: agoraEmBrasilia(), observacao: '' },
      ],
    }));
  }

  function removerMedicamento(chave: number) {
    setF((atual) => ({ ...atual, medicamentos: atual.medicamentos.filter((m) => m.chave !== chave) }));
    // Os erros dos medicamentos são por posição: depois de remover um, valem só na próxima conferência
    setErros((atuais) => Object.fromEntries(Object.entries(atuais).filter(([campo]) => !campo.startsWith('medicamentos.'))));
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const dados = paraDados(f);
    const problemas = validarAtendimento(dados, new Date());
    setErros(Object.fromEntries(problemas.map((p) => [p.campo, p.mensagem])));
    if (problemas.length) {
      setErro(`${problemas.length === 1 ? 'Um campo precisa' : `${problemas.length} campos precisam`} de atenção: confira o que está marcado em vermelho.`);
      setTentativas((n) => n + 1);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      aoSalvar(await nucleo.criarAtendimento(prontuarioId, dados));
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(mensagemDoErro(falha));
      setTentativas((n) => n + 1);
    } finally {
      setSalvando(false);
    }
  }

  const { ocular, verbal, motora } = f.glasgow;
  const totalGlasgow = ocular && verbal && motora ? Number(ocular) + Number(verbal) + Number(motora) : null;
  const maximo = agoraEmBrasilia();

  return (
    <form onSubmit={salvar} noValidate>
      <Stack gap="md">
        <Secao titulo="Ocorrência">
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
              <DateTimePicker
                label="Data e hora"
                valueFormat="DD/MM/YYYY HH:mm"
                value={f.dataHora}
                onChange={(valor) => mudar('dataHora', valor)}
                maxDate={maximo}
                error={erros.dataHora}
                required
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
              <Select
                label="Tipo de ocorrência"
                placeholder="Escolha"
                data={TIPOS_OCORRENCIA.map((t) => ({ value: t, label: TIPO_OCORRENCIA[t] }))}
                value={f.tipoOcorrencia}
                onChange={(valor) => mudar('tipoOcorrencia', valor as TipoOcorrencia | null)}
                error={erros.tipoOcorrencia}
                required
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 6 }}>
              <TextInput
                label="Local da ocorrência"
                placeholder="Rua, número, bairro, cidade"
                value={f.localOcorrencia}
                onChange={(e) => mudar('localOcorrencia', e.currentTarget.value)}
                error={erros.localOcorrencia}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <Textarea
                label="Queixa principal"
                autosize
                minRows={2}
                value={f.queixaPrincipal}
                onChange={(e) => mudar('queixaPrincipal', e.currentTarget.value)}
                error={erros.queixaPrincipal}
                required
              />
            </Grid.Col>
          </Grid>
        </Secao>

        <Secao titulo="Triagem">
          <Stack gap="sm">
            <div>
              <Text size="sm" fw={500} mb={4} id="rotulo-protocolo">
                Protocolo
              </Text>
              <SegmentedControl
                aria-labelledby="rotulo-protocolo"
                value={f.protocolo ?? ''}
                onChange={(valor) => {
                  const protocolo = valor as Protocolo;
                  // A cor escolhida pode não existir no outro protocolo (o START não tem laranja nem azul)
                  setF((atual) => ({
                    ...atual,
                    protocolo,
                    cor: atual.cor && CORES_POR_PROTOCOLO[protocolo].includes(atual.cor) ? atual.cor : null,
                  }));
                  limparErros('triagem.protocolo');
                }}
                data={(Object.keys(PROTOCOLO) as Protocolo[]).map((p) => ({ value: p, label: PROTOCOLO[p] }))}
              />
              {erros['triagem.protocolo'] && (
                <Text size="xs" c="red.7" data-campo-com-erro>
                  {erros['triagem.protocolo']}
                </Text>
              )}
            </div>
            <EscolhaDaCor protocolo={f.protocolo} cor={f.cor} erro={erros['triagem.cor']} aoMudar={(cor) => mudar('cor', cor)} />
          </Stack>
        </Secao>

        <Secao titulo="Escala de Glasgow">
          <Stack gap="xs">
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Select
                label="Abertura ocular"
                placeholder="Não avaliada"
                data={opcoesGlasgow(GLASGOW_OCULAR)}
                value={ocular}
                onChange={(valor) => mudar('glasgow', { ...f.glasgow, ocular: valor })}
                clearable
              />
              <Select
                label="Resposta verbal"
                placeholder="Não avaliada"
                data={opcoesGlasgow(GLASGOW_VERBAL)}
                value={verbal}
                onChange={(valor) => mudar('glasgow', { ...f.glasgow, verbal: valor })}
                clearable
              />
              <Select
                label="Resposta motora"
                placeholder="Não avaliada"
                data={opcoesGlasgow(GLASGOW_MOTORA)}
                value={motora}
                onChange={(valor) => mudar('glasgow', { ...f.glasgow, motora: valor })}
                clearable
              />
            </SimpleGrid>
            {totalGlasgow !== null && (
              <Text size="sm">
                Total: <b>{totalGlasgow}</b> ({gravidadeGlasgow(totalGlasgow)})
              </Text>
            )}
            {erros.glasgow && (
              <Text size="xs" c="red.7" data-campo-com-erro>
                {erros.glasgow}
              </Text>
            )}
          </Stack>
        </Secao>

        <Secao titulo="Sinais vitais">
          <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
            {SINAIS.map((s) => (
              <NumberInput
                key={s.campo}
                label={s.rotulo}
                placeholder="não medido"
                value={f.sinais[s.campo]}
                onChange={(valor) => mudarSinal(s.campo, valor)}
                allowNegative={false}
                allowDecimal={Boolean(s.decimal)}
                decimalScale={s.decimal ? 1 : undefined}
                decimalSeparator=","
                clampBehavior="none"
                hideControls
                rightSection={
                  <Text size="xs" c="dimmed">
                    {s.unidade}
                  </Text>
                }
                rightSectionWidth={52}
                error={erros[`sinaisVitais.${s.campo}`]}
              />
            ))}
          </SimpleGrid>
        </Secao>

        <Secao
          titulo="Medicamentos administrados"
          acoes={
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={adicionarMedicamento} disabled={!medicamentos.length}>
              Adicionar medicamento
            </Button>
          }
        >
          {!catalogo.isLoading && !medicamentos.length && (
            <Alert color="blue" variant="light">
              O catálogo de medicamentos chega na primeira sincronização com o servidor.
            </Alert>
          )}
          {f.medicamentos.length === 0 && medicamentos.length > 0 && (
            <Text size="sm" c="dimmed">
              Nenhum medicamento administrado.
            </Text>
          )}
          {erros.medicamentos && (
            <Text size="xs" c="red.7" data-campo-com-erro>
              {erros.medicamentos}
            </Text>
          )}
          {f.medicamentos.map((m, i) => (
            <Paper key={m.chave} withBorder p="sm" radius="md" aria-label={`Medicamento ${i + 1}`} component="fieldset" style={{ margin: 0 }}>
              <Grid align="flex-start">
                <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
                  <Select
                    label="Medicamento"
                    placeholder="Busque pelo nome"
                    searchable
                    nothingFoundMessage="Nenhum medicamento com esse nome"
                    data={medicamentos.map((item) => ({ value: item.id, label: rotuloDoMedicamento(item) }))}
                    value={m.medicamentoId}
                    onChange={(id) => {
                      const escolhido = medicamentos.find((item) => item.id === id);
                      // A unidade já vem com a unidade padrão do medicamento (docs/09, seção 9.4)
                      mudarMedicamento(m.chave, { medicamentoId: id, unidade: escolhido?.unidadePadrao ?? m.unidade });
                    }}
                    error={erros[`medicamentos.${i}.medicamentoId`]}
                    required
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 3, lg: 2 }}>
                  <NumberInput
                    label="Dose"
                    value={m.dose}
                    onChange={(valor) => mudarMedicamento(m.chave, { dose: valor })}
                    allowNegative={false}
                    decimalScale={3}
                    decimalSeparator=","
                    hideControls
                    error={erros[`medicamentos.${i}.dose`]}
                    required
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 3, lg: 2 }}>
                  <Select
                    label="Unidade"
                    data={UNIDADES.map((u) => ({ value: u, label: UNIDADE[u] }))}
                    value={m.unidade}
                    onChange={(valor) => mudarMedicamento(m.chave, { unidade: valor as Unidade | null })}
                    error={erros[`medicamentos.${i}.unidade`]}
                    required
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6, lg: 2 }}>
                  <Select
                    label="Via"
                    data={VIAS.map((v) => ({ value: v, label: VIA[v] }))}
                    value={m.via}
                    onChange={(valor) => mudarMedicamento(m.chave, { via: valor as Via | null })}
                    error={erros[`medicamentos.${i}.via`]}
                    required
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6, lg: 2 }}>
                  <DateTimePicker
                    label="Horário"
                    valueFormat="DD/MM HH:mm"
                    value={m.horario}
                    onChange={(valor) => mudarMedicamento(m.chave, { horario: valor })}
                    maxDate={maximo}
                    error={erros[`medicamentos.${i}.horario`]}
                    required
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12 }}>
                  <Group gap="xs" align="flex-end" wrap="nowrap">
                    <TextInput
                      style={{ flex: 1 }}
                      label="Observação"
                      value={m.observacao}
                      onChange={(e) => mudarMedicamento(m.chave, { observacao: e.currentTarget.value })}
                      error={erros[`medicamentos.${i}.observacao`]}
                    />
                    <Tooltip label="Remover este medicamento" withArrow>
                      <ActionIcon
                        variant="light"
                        color="red"
                        size="lg"
                        mb={erros[`medicamentos.${i}.observacao`] ? 22 : 0}
                        aria-label={`Remover medicamento ${i + 1}`}
                        onClick={() => removerMedicamento(m.chave)}
                      >
                        <IconTrash size={18} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Grid.Col>
              </Grid>
            </Paper>
          ))}
        </Secao>

        <Secao titulo="Procedimentos e desfecho">
          <Grid>
            <Grid.Col span={12}>
              <Textarea
                label="Procedimentos realizados"
                placeholder="Acesso venoso, imobilização, oxigênio..."
                autosize
                minRows={2}
                value={f.procedimentos}
                onChange={(e) => mudar('procedimentos', e.currentTarget.value)}
                error={erros.procedimentos}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label="Desfecho"
                placeholder="Escolha"
                data={DESFECHOS.map((d) => ({ value: d, label: DESFECHO[d] }))}
                value={f.desfecho}
                onChange={(valor) => mudar('desfecho', valor as TipoDesfecho | null)}
                error={erros['desfecho.tipo']}
                required
              />
            </Grid.Col>
            {f.desfecho === 'ENCAMINHADO_HOSPITAL' && (
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput
                  label="Hospital de destino"
                  value={f.destino}
                  onChange={(e) => mudar('destino', e.currentTarget.value)}
                  error={erros['desfecho.destino']}
                  required
                />
              </Grid.Col>
            )}
            <Grid.Col span={12}>
              <Textarea
                label="Observações"
                autosize
                minRows={2}
                value={f.observacoes}
                onChange={(e) => mudar('observacoes', e.currentTarget.value)}
                error={erros.observacoes}
              />
            </Grid.Col>
          </Grid>
        </Secao>

        {erro && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} role="alert">
            {erro}
          </Alert>
        )}
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Salvo primeiro neste aparelho; vai para o servidor na próxima sincronização.
          </Text>
          <Button type="submit" size="md" loading={salvando}>
            Salvar atendimento
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
