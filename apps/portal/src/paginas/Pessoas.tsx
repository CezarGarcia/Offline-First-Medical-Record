import { Card, Stack, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { cpf, data, normalizar, telefone } from '@compartilhado/formatos';
import { SEXO, rotulo } from '@compartilhado/rotulos';
import type { Pessoa } from '@compartilhado/tipos';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePessoas } from '../api/consultas';
import { EstadoDaConsulta, Pagina } from '../componentes/Pagina';
import { SeloModo, Valor } from '../componentes/Selos';
import { type Coluna, Paginacao, Tabela, usePaginacao } from '../componentes/Tabela';

const COLUNAS: Coluna<Pessoa>[] = [
  {
    titulo: 'Nome',
    celula: (p) => (
      <Text size="sm" fw={600}>
        {p.nome}
      </Text>
    ),
  },
  { titulo: 'CPF', celula: (p) => <Valor vazio="—">{cpf(p.cpf)}</Valor> },
  { titulo: 'Nascimento', celula: (p) => <Valor vazio="—">{data(p.dataNascimento)}</Valor> },
  { titulo: 'Sexo', celula: (p) => <Valor vazio="—">{rotulo(SEXO, p.sexo)}</Valor> },
  {
    titulo: 'Contatos',
    celula: (p) => (
      <Stack gap={0}>
        <Text size="sm">{[telefone(p.telefone), p.email].filter(Boolean).join(' · ') || '—'}</Text>
        {p.contato?.nome && (
          <Text size="xs" c="dimmed">
            Familiar: {p.contato.nome}
            {p.contato.parentesco ? ` (${p.contato.parentesco})` : ''}
            {p.contato.telefone ? ` · ${telefone(p.contato.telefone)}` : ''}
            {p.contato.email ? ` · ${p.contato.email}` : ''}
          </Text>
        )}
      </Stack>
    ),
  },
  {
    titulo: 'Origem',
    celula: (p) => (
      <Stack gap={2}>
        <Text size="sm">{p.origem.criadoPorNome}</Text>
        <Text size="xs" c="dimmed">
          {p.origem.dispositivoNome ?? 'sem dispositivo'}
        </Text>
        <SeloModo modo={p.origem.modo} />
      </Stack>
    ),
  },
];

export function Pessoas() {
  const consulta = usePessoas();
  const navegar = useNavigate();
  const [busca, setBusca] = useState('');

  const filtradas = useMemo(() => {
    const termo = normalizar(busca);
    return (consulta.data ?? []).filter((p) => !termo || normalizar(p.nome).includes(termo) || (p.cpf ?? '').includes(termo));
  }, [consulta.data, busca]);
  const { pagina, paginas, setPagina, itensDaPagina } = usePaginacao(filtradas, 20, busca);

  return (
    <Pagina
      titulo="Pessoas"
      descricao="Pacientes cadastrados (pelos aparelhos ou direto no banco). Clique para ver o prontuário."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
    >
      <Card withBorder padding="md">
        <TextInput
          label="Buscar"
          placeholder="Nome ou CPF"
          leftSection={<IconSearch size={16} />}
          value={busca}
          onChange={(e) => setBusca(e.currentTarget.value)}
        />
      </Card>
      <EstadoDaConsulta consulta={consulta}>
        {() => (
          <Stack gap="sm">
            <Tabela
              itens={itensDaPagina}
              colunas={COLUNAS}
              chave={(p) => p.id}
              aoClicar={(p) => navegar(`/prontuarios/${p.id}`)}
              vazio="Nenhuma pessoa encontrada."
              larguraMinima={1000}
            />
            <Paginacao pagina={pagina} paginas={paginas} total={filtradas.length} aoMudar={setPagina} />
          </Stack>
        )}
      </EstadoDaConsulta>
    </Pagina>
  );
}
