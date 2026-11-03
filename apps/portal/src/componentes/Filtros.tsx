import { type CalendarDate, parseDate } from '@internationalized/date';
import { RiCloseLine } from '@remixicon/react';
import type { ReactNode } from 'react';
import { ComboBox, ComboBoxItem } from '@/components/base/combobox/combobox';
import { DateRangePicker } from '@/components/base/date-picker/date-range-picker';
import { SearchField } from '@/components/base/search-field/search-field';
import { Select, SelectItem } from '@/components/base/select/select';
import { cx } from '@/utils/cx';

/** Período escolhido, como dias "AAAA-MM-DD" (no horário de Brasília); null quando não escolhido. */
export type Periodo = [string | null, string | null];

/** Busca de texto (nome, CPF, rota...), com botão de limpar. */
export function FiltroDeBusca({
  rotulo,
  placeholder,
  valor,
  aoMudar,
  className,
}: {
  rotulo: string;
  placeholder: string;
  valor: string;
  aoMudar: (valor: string) => void;
  className?: string;
}) {
  return (
    <SearchField
      label={rotulo}
      placeholder={placeholder}
      value={valor}
      onChange={aoMudar}
      shape="rounded"
      clearLabel="Limpar"
      className={className}
    />
  );
}

/** Período (de/até) no calendário do BoardUI, com atalhos (hoje, últimos 7 dias, este mês...). */
export function FiltroDePeriodo({ valor, aoMudar, className }: { valor: Periodo; aoMudar: (valor: Periodo) => void; className?: string }) {
  const [de, ate] = valor;
  const intervalo = de ? { start: parseDate(de), end: parseDate(ate ?? de) } : null;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <span aria-hidden className="text-body-medium text-text-primary">
        Período
      </span>
      <div className="flex items-center gap-1.5">
        <DateRangePicker
          aria-label="Período"
          placeholder="Todas as datas"
          value={intervalo}
          onChange={(novo) => aoMudar(novo ? [paraTexto(novo.start), paraTexto(novo.end)] : [null, null])}
          className="min-w-0 flex-1 justify-start"
        />
        {de && (
          <button
            type="button"
            aria-label="Limpar o período"
            onClick={() => aoMudar([null, null])}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-2lg text-foreground-icon-secondary outline-none transition-colors duration-150 hover:bg-background-secondary-hover hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <RiCloseLine className="size-5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

function paraTexto(dia: CalendarDate): string {
  return dia.toString();
}

const TODOS = '__todos__';

export interface Opcao {
  valor: string;
  rotulo: string;
}

/** Lista fixa de opções; a primeira, "Todos", tira o filtro. */
export function FiltroDeLista({
  rotulo,
  opcoes,
  valor,
  aoMudar,
  todos = 'Todos',
  className,
}: {
  rotulo: string;
  opcoes: Opcao[];
  valor: string | null;
  aoMudar: (valor: string | null) => void;
  todos?: string;
  className?: string;
}) {
  return (
    <Select
      label={rotulo}
      selectedKey={valor ?? TODOS}
      onSelectionChange={(chave) => aoMudar(chave === TODOS || chave === null ? null : String(chave))}
      className={className}
    >
      <SelectItem id={TODOS} textValue={todos}>
        <span className="text-text-secondary">{todos}</span>
      </SelectItem>
      {opcoes.map((opcao) => (
        <SelectItem key={opcao.valor} id={opcao.valor} textValue={opcao.rotulo}>
          {opcao.rotulo}
        </SelectItem>
      ))}
    </Select>
  );
}

/** Lista longa com busca (profissionais, ações). Apagar o texto tira o filtro. */
export function FiltroComBusca({
  rotulo,
  opcoes,
  valor,
  aoMudar,
  placeholder = 'Todos',
  className,
}: {
  rotulo: string;
  opcoes: Opcao[];
  valor: string | null;
  aoMudar: (valor: string | null) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <ComboBox
      label={rotulo}
      placeholder={placeholder}
      defaultItems={opcoes.map((opcao) => ({ id: opcao.valor, nome: opcao.rotulo }))}
      selectedKey={valor}
      onSelectionChange={(chave) => aoMudar(chave === null ? null : String(chave))}
      onInputChange={(texto) => {
        if (!texto) aoMudar(null);
      }}
      emptyMessage="Nada encontrado"
      menuTrigger="focus"
      className={className}
    >
      {(item: { id: string; nome: string }) => (
        <ComboBoxItem id={item.id} textValue={item.nome}>
          {item.nome}
        </ComboBoxItem>
      )}
    </ComboBox>
  );
}

/** A grade dos filtros na barra do cartão. */
export function GradeDeFiltros({ colunas = 3, children }: { colunas?: 2 | 3; children: ReactNode }) {
  return <div className={cx('grid grid-cols-1 items-end gap-3 sm:grid-cols-2', colunas === 3 && 'lg:grid-cols-3')}>{children}</div>;
}
