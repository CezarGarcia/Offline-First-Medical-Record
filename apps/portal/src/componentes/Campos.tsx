import type { ComponentType, ReactNode } from 'react';
import { cx } from '@/utils/cx';
import { Cartao } from './Pagina';
import { Valor } from './Selos';

type Icone = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

export interface Campo {
  rotulo: string;
  valor: ReactNode;
  /** Ocupa a linha inteira (textos longos). */
  largo?: boolean;
  destaque?: boolean;
  /** Valor de alerta (alergias): o bloco fica em vermelho. */
  alerta?: boolean;
}

const COLUNAS = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 lg:grid-cols-3', 4: 'md:grid-cols-2 lg:grid-cols-4' } as const;

/** Grade de "rótulo em cima, valor embaixo", como nas seções do PDF: cada campo num bloco. */
export function Campos({ campos, colunas = 3 }: { campos: Campo[]; colunas?: keyof typeof COLUNAS }) {
  return (
    <dl className={cx('grid grid-cols-1 gap-2', COLUNAS[colunas])}>
      {campos.map((campo) => (
        <div
          key={campo.rotulo}
          className={cx(
            'flex min-w-0 flex-col gap-0.5 rounded-2lg px-3 py-2.5',
            campo.alerta ? 'bg-status-rose-background' : 'bg-background-bloco',
            campo.largo && 'col-span-full',
          )}
        >
          <dt className={cx('text-caption-1-medium', campo.alerta ? 'text-status-rose-text' : 'text-text-tertiary')}>{campo.rotulo}</dt>
          <dd
            className={cx(
              'whitespace-pre-line [overflow-wrap:anywhere]',
              campo.destaque ? 'text-headline-medium' : 'text-body-medium',
              campo.alerta ? 'text-status-rose-text' : 'text-text-primary',
            )}
          >
            <Valor>{campo.valor}</Valor>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Um bloco da tela com título (Paciente, Prontuário, Triagem...). */
export function Secao({
  titulo,
  icone: IconeDaSecao,
  acoes,
  className,
  children,
}: {
  titulo: string;
  icone?: Icone;
  acoes?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Cartao className={cx('flex flex-col gap-4 p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-headline-medium text-text-primary">
          {IconeDaSecao && (
            <span className="flex size-8 items-center justify-center rounded-2lg bg-linear-to-b from-accent-500 to-accent-600 shadow-xs">
              <IconeDaSecao className="size-[18px] text-white" aria-hidden />
            </span>
          )}
          {titulo}
        </h2>
        {acoes}
      </div>
      {children}
    </Cartao>
  );
}
