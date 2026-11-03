/**
 * Nova ocorrência (docs/10, seção 10.1): um assistente em 3 passos. 1) a pessoa (busca no aparelho ou cadastro
 * novo), 2) o prontuário (o existente ou um novo) e 3) o atendimento. Tudo é salvo primeiro no aparelho.
 */
import { Alert, Button, Card, Group, Stack, Stepper, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconSearch, IconUserPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { cpf, data, diaEmBrasilia, idade } from '@compartilhado/formatos';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import type { AtendimentoLocal, PessoaLocal, ProntuarioLocal } from '../../../comum/contrato';
import { AvisoDeErro, Carregando, Pagina, SeloSync } from '../componentes/Basicos';
import { AvisoDeAlergias, SecaoProntuario } from '../componentes/Ficha';
import { type Coluna, Paginacao, Tabela, usePaginacao } from '../componentes/Tabela';
import { FormAtendimento } from '../formularios/FormAtendimento';
import { FormPessoa } from '../formularios/FormPessoa';
import { FormProntuario } from '../formularios/FormProntuario';
import { nucleo, useEstadoDoApp } from '../nucleo';

/** Cada clique em "Nova ocorrência" no menu começa do zero. */
export function NovaOcorrencia() {
  const local = useLocation();
  return <Assistente key={local.key} />;
}

function nascimentoComIdade(pessoa: PessoaLocal): string | null {
  if (!pessoa.dataNascimento) return null;
  const anos = idade(pessoa.dataNascimento, diaEmBrasilia(new Date().toISOString()));
  return `${data(pessoa.dataNascimento)}${anos !== null ? ` (${anos} ${anos === 1 ? 'ano' : 'anos'})` : ''}`;
}

function Assistente() {
  const [parametros] = useSearchParams();
  const navegar = useNavigate();
  const estado = useEstadoDoApp();
  const [passo, setPasso] = useState(0);
  const [pessoa, setPessoa] = useState<PessoaLocal | null>(null);
  const [prontuario, setProntuario] = useState<ProntuarioLocal | null>(null);

  // Vindo do detalhe do paciente ("Novo atendimento"), a pessoa já vem escolhida
  const pessoaDaUrl = parametros.get('pessoa');
  useEffect(() => {
    if (!pessoaDaUrl) return;
    let ativo = true;
    void nucleo.paciente(pessoaDaUrl).then((detalhe) => {
      if (ativo && detalhe) escolherPessoa(detalhe.pessoa);
    });
    return () => {
      ativo = false;
    };
  }, [pessoaDaUrl]);

  function escolherPessoa(escolhida: PessoaLocal) {
    setPessoa(escolhida);
    setProntuario(null);
    setPasso(1);
  }

  function escolherProntuario(escolhido: ProntuarioLocal) {
    setProntuario(escolhido);
    setPasso(2);
  }

  function aoSalvarAtendimento(atendimento: AtendimentoLocal) {
    const offline = estado?.conectividade === 'OFFLINE';
    notifications.show({
      color: 'teal',
      title: 'Salvo no aparelho',
      message: offline ? 'Vai para o servidor quando a conexão voltar.' : 'Enviando para o servidor…',
    });
    navegar(`/atendimentos/${atendimento.id}`, { replace: true });
  }

  return (
    <Pagina titulo="Nova ocorrência" descricao="Pessoa, prontuário e atendimento. Tudo é salvo primeiro neste aparelho.">
      <Stepper active={passo} onStepClick={(n) => n < passo && setPasso(n)} allowNextStepsSelect={false} size="sm">
        <Stepper.Step label="Pessoa" description={pessoa ? pessoa.nome : 'Buscar ou cadastrar'}>
          <PassoPessoa aoEscolher={escolherPessoa} />
        </Stepper.Step>
        <Stepper.Step label="Prontuário" description={prontuario ? 'Escolhido' : 'Existente ou novo'}>
          {pessoa && <PassoProntuario pessoa={pessoa} aoEscolher={escolherProntuario} aoVoltar={() => setPasso(0)} />}
        </Stepper.Step>
        <Stepper.Step label="Atendimento" description="A ficha">
          {pessoa && prontuario && (
            <Stack gap="md">
              <Card withBorder radius="md" padding="md">
                <Group justify="space-between">
                  <div>
                    <Text fw={700} size="lg">
                      {pessoa.nome}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {[cpf(pessoa.cpf) && `CPF ${cpf(pessoa.cpf)}`, nascimentoComIdade(pessoa)].filter(Boolean).join(' · ') ||
                        'Sem CPF e sem data de nascimento'}
                    </Text>
                  </div>
                  <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => setPasso(1)}>
                    Voltar ao prontuário
                  </Button>
                </Group>
              </Card>
              <AvisoDeAlergias prontuario={prontuario} />
              <FormAtendimento prontuarioId={prontuario.id} aoSalvar={aoSalvarAtendimento} />
            </Stack>
          )}
        </Stepper.Step>
      </Stepper>
    </Pagina>
  );
}

function PassoPessoa({ aoEscolher }: { aoEscolher: (pessoa: PessoaLocal) => void }) {
  const [termo, setTermo] = useState('');
  const [termoAtrasado] = useDebouncedValue(termo, 200);
  const [cadastrando, setCadastrando] = useState(false);
  const busca = useQuery({ queryKey: ['pessoas', termoAtrasado], queryFn: () => nucleo.buscarPessoas(termoAtrasado) });
  const itens = busca.data ?? [];
  const paginacao = usePaginacao(itens, 8, termoAtrasado);

  if (cadastrando) {
    return (
      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={700}>Cadastrar pessoa</Text>
            <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => setCadastrando(false)}>
              Voltar à busca
            </Button>
          </Group>
          <FormPessoa aoSalvar={aoEscolher} aoUsarExistente={aoEscolher} />
        </Stack>
      </Card>
    );
  }

  const colunas: Coluna<PessoaLocal>[] = [
    { titulo: 'Nome', celula: (p) => <Text fw={600}>{p.nome}</Text> },
    { titulo: 'CPF', celula: (p) => cpf(p.cpf) ?? '—', semQuebra: true },
    { titulo: 'Nascimento', celula: (p) => nascimentoComIdade(p) ?? '—', semQuebra: true },
    { titulo: 'Sincronização', celula: (p) => <SeloSync estado={p.estadoSync} />, semQuebra: true },
    {
      titulo: '',
      largura: 120,
      celula: (p) => (
        <Button size="xs" onClick={() => aoEscolher(p)}>
          Selecionar
        </Button>
      ),
    },
  ];

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <TextInput
          style={{ flex: 1, minWidth: 260 }}
          label="Buscar pessoa neste aparelho"
          placeholder="Nome ou CPF"
          leftSection={<IconSearch size={16} />}
          value={termo}
          onChange={(e) => setTermo(e.currentTarget.value)}
          autoFocus
        />
        <Button leftSection={<IconUserPlus size={16} />} variant="light" onClick={() => setCadastrando(true)}>
          Cadastrar nova pessoa
        </Button>
      </Group>
      {busca.isLoading ? (
        <Carregando />
      ) : busca.isError ? (
        <AvisoDeErro erro={busca.error} />
      ) : (
        <Card withBorder radius="md" padding={0}>
          <Tabela
            itens={paginacao.itensDaPagina}
            colunas={colunas}
            chave={(p) => p.id}
            larguraMinima={640}
            vazio={termo ? 'Ninguém com esse nome ou CPF neste aparelho. Cadastre uma pessoa nova.' : 'Nenhuma pessoa neste aparelho ainda.'}
          />
          {itens.length > 0 && (
            <Stack p="sm">
              <Paginacao pagina={paginacao.pagina} paginas={paginacao.paginas} total={itens.length} aoMudar={paginacao.setPagina} />
            </Stack>
          )}
        </Card>
      )}
    </Stack>
  );
}

function PassoProntuario({
  pessoa,
  aoEscolher,
  aoVoltar,
}: {
  pessoa: PessoaLocal;
  aoEscolher: (prontuario: ProntuarioLocal) => void;
  aoVoltar: () => void;
}) {
  const detalhe = useQuery({ queryKey: ['paciente', pessoa.id], queryFn: () => nucleo.paciente(pessoa.id) });
  if (detalhe.isLoading) return <Carregando />;
  if (detalhe.isError) return <AvisoDeErro erro={detalhe.error} />;
  const prontuarios = detalhe.data?.prontuarios ?? [];

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text>
          Prontuário de <b>{pessoa.nome}</b>
        </Text>
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={aoVoltar}>
          Trocar a pessoa
        </Button>
      </Group>
      {prontuarios.length > 1 && (
        <Alert color="blue" variant="light">
          Esta pessoa tem {prontuarios.length} prontuários neste aparelho (feitos em aparelhos diferentes). Na sincronização, o
          servidor une os dois num só.
        </Alert>
      )}
      {prontuarios.map((p) => (
        <SecaoProntuario
          key={p.id}
          prontuario={p}
          acoes={
            <Group gap="xs">
              <SeloSync estado={p.estadoSync} />
              <Button size="xs" onClick={() => aoEscolher(p)}>
                Usar este prontuário
              </Button>
            </Group>
          }
        />
      ))}
      {prontuarios.length === 0 && (
        <Card withBorder radius="md" padding="lg">
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Esta pessoa ainda não tem prontuário neste aparelho. Preencha o que souber: tudo é opcional.
            </Text>
            <FormProntuario pessoaId={pessoa.id} aoSalvar={aoEscolher} />
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
