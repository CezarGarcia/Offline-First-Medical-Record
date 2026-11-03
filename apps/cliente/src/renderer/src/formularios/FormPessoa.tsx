import { Alert, Button, Group, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconUserCheck } from '@tabler/icons-react';
import { diaEmBrasilia, cpf as formatarCpf } from '@compartilhado/formatos';
import { SEXO } from '@compartilhado/rotulos';
import type { Sexo } from '@compartilhado/tipos';
import { type DadosPessoa, SEXOS, validarPessoa } from '@compartilhado/validacao';
import { type FormEvent, useEffect, useState } from 'react';
import type { PessoaLocal } from '../../../comum/contrato';
import { errosPorCampo, mensagemDoErro, nucleo } from '../nucleo';

interface Props {
  aoSalvar: (pessoa: PessoaLocal) => void;
  /** O CPF digitado já existe neste aparelho: a tela oferece usar a pessoa existente. */
  aoUsarExistente: (pessoa: PessoaLocal) => void;
}

const vazio: DadosPessoa = {
  nome: '',
  cpf: '',
  dataNascimento: null,
  sexo: null,
  telefone: '',
  email: '',
  contato: { nome: '', parentesco: '', telefone: '', email: '' },
};

export function FormPessoa({ aoSalvar, aoUsarExistente }: Props) {
  const [dados, setDados] = useState<DadosPessoa>(vazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mesmoCpf, setMesmoCpf] = useState<PessoaLocal | null>(null);
  const digitos = (dados.cpf ?? '').replace(/\D/g, '');

  useEffect(() => {
    let ativo = true;
    if (digitos.length !== 11) {
      setMesmoCpf(null);
      return;
    }
    void nucleo.pessoaComCpf(digitos).then((p) => ativo && setMesmoCpf(p));
    return () => {
      ativo = false;
    };
  }, [digitos]);

  const limparErro = (campo: string) =>
    setErros((atuais) => (campo in atuais ? Object.fromEntries(Object.entries(atuais).filter(([c]) => c !== campo)) : atuais));
  const mudar = (campo: keyof DadosPessoa, valor: unknown) => {
    setDados((d) => ({ ...d, [campo]: valor }));
    limparErro(campo);
  };
  const mudarContato = (campo: string, valor: string) => {
    setDados((d) => ({ ...d, contato: { ...d.contato, [campo]: valor } }));
    limparErro(`contato.${campo}`);
  };

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const pedido = { ...dados, cpf: digitos || null };
    const problemas = validarPessoa(pedido, diaEmBrasilia(new Date().toISOString()));
    setErros(Object.fromEntries(problemas.map((p) => [p.campo, p.mensagem])));
    if (problemas.length) return;
    setSalvando(true);
    setErro(null);
    try {
      aoSalvar(await nucleo.criarPessoa(pedido));
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} noValidate>
      <Stack gap="md">
        {erro && (
          <Alert color="red" variant="light" role="alert">
            {erro}
          </Alert>
        )}
        <TextInput
          label="Nome"
          description='Paciente sem identificação: escreva, por exemplo, "Desconhecido".'
          value={dados.nome}
          onChange={(e) => mudar('nome', e.currentTarget.value)}
          error={erros.nome}
          required
          autoFocus
        />
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TextInput label="CPF" placeholder="Só números" value={dados.cpf ?? ''} onChange={(e) => mudar('cpf', e.currentTarget.value)} error={erros.cpf} maxLength={14} />
          <DateInput
            label="Data de nascimento"
            placeholder="DD/MM/AAAA"
            valueFormat="DD/MM/YYYY"
            value={dados.dataNascimento ?? null}
            onChange={(valor) => mudar('dataNascimento', valor)}
            maxDate={diaEmBrasilia(new Date().toISOString())}
            error={erros.dataNascimento}
            clearable
          />
          <Select
            label="Sexo"
            placeholder="Escolha"
            data={SEXOS.map((s) => ({ value: s, label: SEXO[s] }))}
            value={dados.sexo ?? null}
            onChange={(valor) => mudar('sexo', valor as Sexo | null)}
            clearable
          />
        </SimpleGrid>
        {mesmoCpf && (
          <Alert color="orange" variant="light" icon={<IconUserCheck size={18} />}>
            <Group justify="space-between">
              <span>
                Já existe neste aparelho uma pessoa com o CPF {formatarCpf(mesmoCpf.cpf)}: <b>{mesmoCpf.nome}</b>.
              </span>
              <Button size="xs" variant="light" color="orange" onClick={() => aoUsarExistente(mesmoCpf)}>
                Usar esta pessoa
              </Button>
            </Group>
          </Alert>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Telefone" placeholder="51999990000" value={dados.telefone ?? ''} onChange={(e) => mudar('telefone', e.currentTarget.value)} error={erros.telefone} />
          <TextInput label="E-mail" description="Usado no envio da ficha ao paciente" value={dados.email ?? ''} onChange={(e) => mudar('email', e.currentTarget.value)} error={erros.email} />
        </SimpleGrid>
        <Title order={5}>Contato de um familiar</Title>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Nome" value={dados.contato?.nome ?? ''} onChange={(e) => mudarContato('nome', e.currentTarget.value)} error={erros['contato.nome']} />
          <TextInput label="Parentesco" placeholder="Esposa, filho..." value={dados.contato?.parentesco ?? ''} onChange={(e) => mudarContato('parentesco', e.currentTarget.value)} error={erros['contato.parentesco']} />
          <TextInput label="Telefone" value={dados.contato?.telefone ?? ''} onChange={(e) => mudarContato('telefone', e.currentTarget.value)} error={erros['contato.telefone']} />
          <TextInput
            label="E-mail"
            description="Usado no envio da ficha ao familiar"
            value={dados.contato?.email ?? ''}
            onChange={(e) => mudarContato('email', e.currentTarget.value)}
            error={erros['contato.email']}
          />
        </SimpleGrid>
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Salvo primeiro neste aparelho; vai para o servidor na próxima sincronização.
          </Text>
          <Button type="submit" loading={salvando}>
            Salvar pessoa e continuar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
