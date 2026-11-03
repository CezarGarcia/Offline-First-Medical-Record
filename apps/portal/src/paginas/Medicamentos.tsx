import { Card, Stack, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { dataHora, normalizar } from '@compartilhado/formatos';
import { UNIDADE, rotulo } from '@compartilhado/rotulos';
import type { Medicamento } from '@compartilhado/tipos';
import { useMemo, useState } from 'react';
import { useMedicamentos } from '../api/consultas';
import { EstadoDaConsulta, Pagina } from '../componentes/Pagina';
import { SeloSimNao, Valor } from '../componentes/Selos';
import { type Coluna, Paginacao, Tabela, usePaginacao } from '../componentes/Tabela';

const COLUNAS: Coluna<Medicamento>[] = [
  {
    titulo: 'Nome',
    celula: (m) => (
      <Text size="sm" fw={600}>
        {m.nome}
      </Text>
    ),
  },
  { titulo: 'Apresentação', celula: (m) => <Valor vazio="—">{m.apresentacao}</Valor> },
  { titulo: 'Unidade padrão', celula: (m) => rotulo(UNIDADE, m.unidadePadrao) },
  { titulo: 'Situação', celula: (m) => <SeloSimNao valor={m.ativo} /> },
  { titulo: 'Atualizado em', celula: (m) => dataHora(m.atualizadoEm) },
];

export function Medicamentos() {
  const consulta = useMedicamentos();
  const [busca, setBusca] = useState('');
  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    return (consulta.data ?? []).filter((m) => !termo || normalizar(`${m.nome} ${m.apresentacao ?? ''}`).includes(termo));
  }, [consulta.data, busca]);
  const { pagina, paginas, setPagina, itensDaPagina } = usePaginacao(filtrados, 25, busca);

  return (
    <Pagina
      titulo="Medicamentos"
      descricao="Catálogo usado nas fichas. É um cadastro de apoio: novos medicamentos entram direto no banco (passo 9 do roteiro) e aparecem aqui ao atualizar."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
    >
      <Card withBorder padding="md">
        <TextInput
          label="Buscar"
          placeholder="Nome ou apresentação"
          leftSection={<IconSearch size={16} />}
          value={busca}
          onChange={(e) => setBusca(e.currentTarget.value)}
        />
      </Card>
      <EstadoDaConsulta consulta={consulta}>
        {() => (
          <Stack gap="sm">
            <Tabela itens={itensDaPagina} colunas={COLUNAS} chave={(m) => m.id} vazio="Nenhum medicamento encontrado." larguraMinima={700} />
            <Paginacao pagina={pagina} paginas={paginas} total={filtrados.length} aoMudar={setPagina} />
          </Stack>
        )}
      </EstadoDaConsulta>
    </Pagina>
  );
}
