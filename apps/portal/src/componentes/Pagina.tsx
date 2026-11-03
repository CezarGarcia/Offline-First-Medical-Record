import { RiRefreshLine } from '@remixicon/react';
import { type ComponentProps, type ReactNode, useEffect } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Notification } from '@/components/base/notification/notification';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import { cx } from '@/utils/cx';
import { hora } from '@compartilhado/formatos';
import { mensagemDoErro } from '../api/erros';

interface PropsDaPagina {
  titulo: string;
  descricao?: ReactNode;
  /** Caminho acima do título (Atendimentos › Ficha Nº ...). */
  migalhas?: ReactNode;
  /** Botão "Atualizar": busca os dados de novo (docs/10, seção 10.2). */
  aoAtualizar?: () => void;
  atualizando?: boolean;
  /** Quando os dados foram buscados pela última vez (ms), mostrado ao lado do botão. */
  atualizadoEm?: number;
  acoes?: ReactNode;
  children: ReactNode;
}

/** O ícone de atualizar gira enquanto a busca está em andamento. */
function IconeGirando({ className, ...props }: ComponentProps<typeof RiRefreshLine>) {
  return <RiRefreshLine {...props} className={cx(className, 'animate-spin')} />;
}

export function Pagina({ titulo, descricao, migalhas, aoAtualizar, atualizando, atualizadoEm, acoes, children }: PropsDaPagina) {
  useTitulo(titulo);
  return (
    <div className="pagina-entra mx-auto flex w-full max-w-[1400px] flex-col gap-6">
      <header className="flex flex-col gap-3">
        {migalhas}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-title-1-medium text-text-primary">{titulo}</h1>
            {descricao && <p className="max-w-3xl text-body-regular text-text-secondary">{descricao}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {aoAtualizar && atualizadoEm ? (
              <span className="hidden text-caption-1-medium text-text-tertiary md:inline">
                Atualizado às {hora(new Date(atualizadoEm).toISOString())}
              </span>
            ) : null}
            {acoes}
            {aoAtualizar && (
              <Button
                variant="secondary"
                leadingIcon={atualizando ? IconeGirando : RiRefreshLine}
                onClick={aoAtualizar}
                aria-busy={atualizando || undefined}
              >
                Atualizar
              </Button>
            )}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

export function useTitulo(titulo: string) {
  useEffect(() => {
    document.title = `${titulo} · MedicalField`;
  }, [titulo]);
}

/** O cartão padrão das telas (BoardUI: rounded-3xl, borda do botão, fundo primário). */
export function Cartao({ className, children, ...props }: ComponentProps<'section'>) {
  return (
    <section {...props} className={cx('rounded-3xl border border-border-button-default bg-background-cartao shadow-card', className)}>
      {children}
    </section>
  );
}

/**
 * Um cartão com barra de filtros em cima, o conteúdo (geralmente a tabela) e um rodapé (paginação).
 * Os filtros ficam no mesmo cartão da lista que eles filtram.
 */
export function Quadro({ barra, rodape, children }: { barra?: ReactNode; rodape?: ReactNode; children: ReactNode }) {
  return (
    <Cartao className="overflow-hidden">
      {barra && <div className="flex flex-col gap-3 p-4">{barra}</div>}
      {children}
      {rodape && <div className="border-t border-separator-border px-4 py-3">{rodape}</div>}
    </Cartao>
  );
}

/** Esqueleto no formato de uma lista, enquanto os dados chegam. */
export function Carregando({ linhas = 6 }: { linhas?: number }) {
  return (
    <div role="status" aria-label="Carregando" className="flex flex-col gap-3 p-4">
      <Skeleton shape="text" className="h-8 w-full" />
      {Array.from({ length: linhas }, (_, indice) => (
        <div key={indice} className="flex items-center gap-4">
          <Skeleton shape="text" className="h-4 w-28" />
          <Skeleton shape="text" className="h-4 flex-1" />
          <Skeleton shape="text" className="hidden h-4 w-24 sm:block" />
          <Skeleton shape="text" className="hidden h-4 w-16 md:block" />
        </div>
      ))}
    </div>
  );
}

interface ConsultaMinima {
  isPending: boolean;
  isError: boolean;
  error: unknown;
}

/** Enquanto carrega, um esqueleto; se der erro, a mensagem da API; senão, o conteúdo. */
export function EstadoDaConsulta({
  consulta,
  carregando,
  children,
}: {
  consulta: ConsultaMinima;
  carregando?: ReactNode;
  children: () => ReactNode;
}) {
  if (consulta.isPending) return <>{carregando ?? <Carregando />}</>;
  if (consulta.isError) {
    return (
      <div className="p-4">
        <AvisoDeErro erro={consulta.error} />
      </div>
    );
  }
  return <>{children()}</>;
}

/** Um aviso fixo na tela (não some sozinho), nos tons dos avisos do BoardUI. */
export function Aviso({
  tipo = 'information',
  titulo,
  children,
  className,
}: {
  tipo?: 'information' | 'error' | 'success' | 'neutral';
  titulo: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Notification status={tipo} title={titulo} description={children} dismissible={false} className={cx('pe-4 shadow-none', className)} />
  );
}

export function AvisoDeErro({ erro, titulo = 'Não foi possível carregar' }: { erro: unknown; titulo?: string }) {
  return (
    <Aviso tipo="error" titulo={titulo}>
      {mensagemDoErro(erro)}
    </Aviso>
  );
}
