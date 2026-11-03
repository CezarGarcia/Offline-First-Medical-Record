import { Button, Card, Group, Stack, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { cpf, data, telefone } from '@compartilhado/formatos';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { PessoaLocal } from '../../../comum/contrato';
import { AvisoDeErro, Carregando, Pagina, SeloModo, SeloSync } from '../componentes/Basicos';
import { type Coluna, Paginacao, Tabela, usePaginacao } from '../componentes/Tabela';
import { nucleo } from '../nucleo';

/** As pessoas deste aparelho: as cadastradas aqui e as que vieram do servidor na sincronização. */
export function Pacientes() {
  const navegar = useNavigate();
  const [termo, setTermo] = useState('');
  const [termoAtrasado] = useDebouncedValue(termo, 200);
  const pessoas = useQuery({ queryKey: ['pessoas', termoAtrasado], queryFn: () => nucleo.buscarPessoas(termoAtrasado) });
  const itens = pessoas.data ?? [];
  const paginacao = usePaginacao(itens, 20, termoAtrasado);

  const colunas: Coluna<PessoaLocal>[] = [
    { titulo: 'Nome', celula: (p) => <Text fw={600}>{p.nome}</Text> },
    { titulo: 'CPF', celula: (p) => cpf(p.cpf) ?? '—', semQuebra: true },
    { titulo: 'Nascimento', celula: (p) => data(p.dataNascimento) ?? '—', semQuebra: true },
    { titulo: 'Telefone', celula: (p) => telefone(p.telefone) ?? '—', semQuebra: true },
    {
      titulo: 'Registrado por',
      celula: (p) => (
        <Stack gap={0}>
          <Text size="sm">{p.origem.criadoPorNome}</Text>
          <Text size="xs" c="dimmed">
            {p.origem.dispositivoNome ?? 'Portal'}
          </Text>
        </Stack>
      ),
    },
    { titulo: 'Modo', celula: (p) => <SeloModo modo={p.origem.modo} />, semQuebra: true },
    { titulo: 'Sincronização', celula: (p) => <SeloSync estado={p.estadoSync} />, semQuebra: true },
  ];

  return (
    <Pagina
      titulo="Pacientes"
      descricao="Cadastrados neste aparelho ou recebidos do servidor na sincronização."
      acoes={
        <Button component={Link} to="/nova-ocorrencia" leftSection={<IconPlus size={16} />}>
          Nova ocorrência
        </Button>
      }
    >
      <Group>
        <TextInput
          style={{ flex: 1, maxWidth: 420 }}
          placeholder="Buscar por nome ou CPF"
          aria-label="Buscar por nome ou CPF"
          leftSection={<IconSearch size={16} />}
          value={termo}
          onChange={(e) => setTermo(e.currentTarget.value)}
        />
      </Group>
      {pessoas.isLoading ? (
        <Carregando />
      ) : pessoas.isError ? (
        <AvisoDeErro erro={pessoas.error} />
      ) : (
        <Card withBorder radius="md" padding={0}>
          <Tabela
            itens={paginacao.itensDaPagina}
            colunas={colunas}
            chave={(p) => p.id}
            aoClicar={(p) => navegar(`/pacientes/${p.id}`)}
            vazio={termo ? 'Ninguém com esse nome ou CPF neste aparelho.' : 'Nenhuma pessoa neste aparelho ainda.'}
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
