import { Group, Pagination, Table, Text } from '@mantine/core';
import { type ReactNode, useEffect, useState } from 'react';

export interface Coluna<T> {
  titulo: string;
  celula: (item: T) => ReactNode;
  largura?: number | string;
  /** Valores curtos (data, status, tempo): nunca quebram linha. */
  semQuebra?: boolean;
}

interface PropsDaTabela<T> {
  itens: T[];
  colunas: Coluna<T>[];
  chave: (item: T) => string;
  aoClicar?: (item: T) => void;
  vazio?: string;
  larguraMinima?: number;
}

/** Tabela simples com rolagem horizontal; a linha pode ser clicável (abre o detalhe). */
export function Tabela<T>({ itens, colunas, chave, aoClicar, vazio = 'Nada encontrado.', larguraMinima = 900 }: PropsDaTabela<T>) {
  if (itens.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        {vazio}
      </Text>
    );
  }
  return (
    <Table.ScrollContainer minWidth={larguraMinima}>
      <Table striped highlightOnHover={Boolean(aoClicar)} verticalSpacing="sm" bg="white">
        <Table.Thead>
          <Table.Tr>
            {colunas.map((coluna) => (
              <Table.Th key={coluna.titulo} style={coluna.largura ? { width: coluna.largura } : undefined}>
                {coluna.titulo}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {itens.map((item) => (
            <Table.Tr
              key={chave(item)}
              onClick={aoClicar ? () => aoClicar(item) : undefined}
              style={aoClicar ? { cursor: 'pointer' } : undefined}
            >
              {colunas.map((coluna) => (
                <Table.Td key={coluna.titulo} style={coluna.semQuebra ? { whiteSpace: 'nowrap' } : undefined}>
                  {coluna.celula(item)}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** Paginação feita no navegador, para as listas que a API devolve inteiras. Volta para a página 1 quando o filtro muda. */
export function usePaginacao<T>(itens: T[], porPagina = 20, filtro: unknown = null) {
  const [pagina, setPagina] = useState(1);
  const chaveDoFiltro = JSON.stringify(filtro);
  useEffect(() => {
    setPagina(1);
  }, [chaveDoFiltro]);
  const paginas = Math.max(1, Math.ceil(itens.length / porPagina));
  const atual = Math.min(pagina, paginas);
  return {
    pagina: atual,
    paginas,
    setPagina,
    itensDaPagina: itens.slice((atual - 1) * porPagina, atual * porPagina),
  };
}

/** Rodapé com "N itens" e os botões de página. */
export function Paginacao({
  pagina,
  paginas,
  total,
  aoMudar,
}: {
  pagina: number;
  paginas: number;
  total: number;
  aoMudar: (pagina: number) => void;
}) {
  return (
    <Group justify="space-between">
      <Text size="sm" c="dimmed">
        {total === 1 ? '1 item' : `${total} itens`}
      </Text>
      {paginas > 1 && <Pagination total={paginas} value={pagina} onChange={aoMudar} size="sm" />}
    </Group>
  );
}
