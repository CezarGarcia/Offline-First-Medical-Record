import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router';
import { buttonStyles } from '@/components/base/buttons/button';
import { cx } from '@/utils/cx';

type Icone = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

/** Um link do React Router com a cara do Button do BoardUI (os mesmos estilos), para navegar sem recarregar. */
export function BotaoLink({
  para,
  variante = 'secondary',
  icone: IconeDoBotao,
  children,
}: {
  para: string;
  variante?: 'primary' | 'secondary' | 'ghost';
  icone?: Icone;
  children: ReactNode;
}) {
  return (
    <Link to={para} className={cx(buttonStyles.base, buttonStyles.size.medium, buttonStyles.variant[variante])}>
      {IconeDoBotao && <IconeDoBotao className={buttonStyles.icon.medium} aria-hidden />}
      <span className={buttonStyles.label.medium}>{children}</span>
    </Link>
  );
}
