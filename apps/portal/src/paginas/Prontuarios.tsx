import { Badge, Card, Stack, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { cpf, normalizar } from '@compartilhado/formatos';
import type { ProntuarioDaLista } from '@compartilhado/tipos';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAtendimentos, useProntuarios } from '../api/consultas';
import { EstadoDaConsulta, Pagina } from '../componentes/Pagina';
import { Valor } from '../componentes/Selos';
import { type Coluna, Paginacao, Tabela, usePaginacao } from '../componentes/Tabela';

export function Prontuarios() {
  const prontuarios = useProntuarios();
  const atendimentos = useAtendimentos();
  const navegar = useNavigate();
  const [busca, setBusca] = useState('');

  // Quantos atendimentos cada pessoa tem (a lista de atendimentos já traz a pessoa de cada um)
  const quantidade = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const a of atendimentos.data ?? []) contagem.set(a.pessoa.id, (contagem.get(a.pessoa.id) ?? 0) + 1);
    return contagem;
  }, [atendimentos.data]);

  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    return (prontuarios.data ?? [])
      .filter((p) => !termo || normalizar(p.pessoa.nome).includes(termo) || (p.pessoa.cpf ?? '').includes(termo))
      .sort((a, b) => a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR'));
  }, [prontuarios.data, busca]);

  const { pagina, paginas, setPagina, itensDaPagina } = usePaginacao(filtrados, 20, busca);

  const colunas: Coluna<ProntuarioDaLista>[] = [
    {
      titulo: 'Paciente',
      celula: (p) => (
        <Text size="sm" fw={600}>
          {p.pessoa.nome}
        </Text>
      ),
    },
    { titulo: 'CPF', celula: (p) => <Valor vazio="—">{cpf(p.pessoa.cpf)}</Valor> },
    {
      titulo: 'Tipo sanguíneo',
      celula: (p) => <Valor vazio="—">{p.tipoSanguineo === 'DESCONHECIDO' ? 'Desconhecido' : p.tipoSanguineo}</Valor>,
    },
    {
      titulo: 'Alergias',
      celula: (p) =>
        p.alergias ? (
          <Text size="sm" c="red.8" fw={600}>
            {p.alergias}
          </Text>
        ) : (
          <Valor vazio="nenhuma informada">{null}</Valor>
        ),
    },
    {
      titulo: 'Atendimentos',
      celula: (p) => (
        <Badge variant="light" color="gray">
          {atendimentos.isPending ? '…' : (quantidade.get(p.pessoaId) ?? 0)}
        </Badge>
      ),
    },
  ];

  return (
    <Pagina
      titulo="Prontuários"
      descricao="Um prontuário por pessoa: o histórico clínico fixo (tipo sanguíneo, alergias, doenças, remédios)."
      aoAtualizar={() => {
        void prontuarios.refetch();
        void atendimentos.refetch();
      }}
      atualizando={prontuarios.isFetching || atendimentos.isFetching}
    >
      <Card withBorder padding="md">
        <TextInput
          label="Paciente"
          placeholder="Nome ou CPF"
          leftSection={<IconSearch size={16} />}
          value={busca}
          onChange={(e) => setBusca(e.currentTarget.value)}
        />
      </Card>
      <EstadoDaConsulta consulta={prontuarios}>
        {() => (
          <Stack gap="sm">
            <Tabela
              itens={itensDaPagina}
              colunas={colunas}
              chave={(p) => p.id}
              aoClicar={(p) => navegar(`/prontuarios/${p.pessoaId}`)}
              vazio="Nenhum prontuário encontrado."
              larguraMinima={800}
            />
            <Paginacao pagina={pagina} paginas={paginas} total={filtrados.length} aoMudar={setPagina} />
          </Stack>
        )}
      </EstadoDaConsulta>
    </Pagina>
  );
}
