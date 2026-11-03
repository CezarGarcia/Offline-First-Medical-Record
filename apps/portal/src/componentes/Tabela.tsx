import { RiInboxLine } from '@remixicon/react';
import { type ReactNode, useEffect, useState } from 'react';
import { Pagination } from '@/components/base/pagination/pagination';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@/components/base/table/table';
import { cx } from '@/utils/cx';

export interface Coluna<T> {
  titulo: string;
  celula: (item: T) => ReactNode;
  largura?: number | string;
  /** Valores curtos (data, status, tempo): nunca quebram linha. */
  semQuebra?: boolean;
}

interface PropsDaTabela<T> {
  /** Nome da tabela para leitores de tela ("Atendimentos"). */
  rotulo: string;
  itens: T[];
  colunas: Coluna<T>[];
  chave: (item: T) => string;
  /** Endereço que a linha abre (a ficha, o prontuário). Ctrl/⌘+clique abre em outra aba. */
  link?: (item: T) => string;
  vazio?: string;
  larguraMinima?: number;
}

/** Quando a lista está vazia: ícone e texto no meio da tabela. */
function Vazio({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-background-tertiary-default">
        <RiInboxLine className="size-6 text-foreground-icon-tertiary" aria-hidden />
      </span>
      <p className="text-body-medium text-text-secondary">{texto}</p>
    </div>
  );
}

/** Tabela do BoardUI (React Aria) com rolagem horizontal; a linha pode abrir um endereço. */
export function Tabela<T>({ rotulo, itens, colunas, chave, link, vazio = 'Nada encontrado.', larguraMinima = 900 }: PropsDaTabela<T>) {
  const colunasComId = colunas.map((coluna) => ({ ...coluna, id: coluna.titulo }));
  return (
    <Table aria-label={rotulo} style={{ minWidth: itens.length ? larguraMinima : undefined }} className="[&_th]:border-t-0">
      <TableHeader columns={colunasComId}>
        {(coluna) => (
          <TableColumn
            id={coluna.id}
            isRowHeader={coluna.id === colunasComId[0]?.id}
            style={coluna.largura ? { width: coluna.largura } : undefined}
          >
            {coluna.titulo}
          </TableColumn>
        )}
      </TableHeader>
      <TableBody items={itens.map((item) => ({ id: chave(item), item }))} renderEmptyState={() => <Vazio texto={vazio} />}>
        {({ id, item }) => (
          <TableRow id={id} columns={colunasComId} href={link?.(item)} className={cx('cartao-entra', link && 'linha-clicavel')}>
            {(coluna) => <TableCell className={cx(coluna.semQuebra && 'whitespace-nowrap')}>{coluna.celula(item)}</TableCell>}
          </TableRow>
        )}
      </TableBody>
    </Table>
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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-body-medium text-text-secondary tabular-nums">{total === 1 ? '1 item' : `${total} itens`}</span>
      {paginas > 1 && (
        <Pagination page={pagina} totalPages={paginas} onChange={aoMudar} className="w-auto flex-1 justify-end sm:flex-none" />
      )}
    </div>
  );
}
