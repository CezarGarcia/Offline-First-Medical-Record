import {
  RiArrowLeftRightLine,
  RiCapsuleLine,
  RiCloseLine,
  RiCodeSSlashLine,
  RiComputerLine,
  RiFileList3Line,
  RiFirstAidKitLine,
  RiGroupLine,
  RiHeartPulseFill,
  RiListCheck3,
  RiLogoutBoxRLine,
  RiMailSendLine,
  RiSearchLine,
  RiSideBarFill,
  RiUserStarLine,
} from '@remixicon/react';
import type { ComponentProps, ComponentType, ReactNode } from 'react';
import { Focusable } from 'react-aria-components';
import { NavLink } from 'react-router';
import { ThemeToggle } from '@/components/application/theme/theme-toggle';
import { Avatar } from '@/components/base/avatar/avatar';
import { Kbd } from '@/components/base/kbd/kbd';
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip';
import { cx } from '@/utils/cx';
import type { Sessao } from '../api/sessao';
import { iniciais } from './Selos';

type Icone = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

export interface ItemDoMenu {
  rotulo: string;
  caminho: string;
  icone: Icone;
}

export const MENU: { grupo: string; itens: ItemDoMenu[] }[] = [
  {
    grupo: 'Atendimento',
    itens: [
      { rotulo: 'Atendimentos', caminho: '/atendimentos', icone: RiFirstAidKitLine },
      { rotulo: 'Prontuários', caminho: '/prontuarios', icone: RiFileList3Line },
      { rotulo: 'Pessoas', caminho: '/pessoas', icone: RiGroupLine },
    ],
  },
  {
    grupo: 'Cadastros de apoio',
    itens: [
      { rotulo: 'Medicamentos', caminho: '/medicamentos', icone: RiCapsuleLine },
      { rotulo: 'Profissionais', caminho: '/profissionais', icone: RiUserStarLine },
    ],
  },
  {
    grupo: 'Auditoria',
    itens: [
      { rotulo: 'Logs de acesso', caminho: '/logs/acesso', icone: RiListCheck3 },
      { rotulo: 'Logs dos clientes', caminho: '/logs/clientes', icone: RiComputerLine },
      { rotulo: 'Conflitos', caminho: '/conflitos', icone: RiArrowLeftRightLine },
      { rotulo: 'E-mails enviados', caminho: '/emails', icone: RiMailSendLine },
    ],
  },
  {
    grupo: 'Documentação',
    itens: [{ rotulo: 'API (Swagger)', caminho: '/documentacao', icone: RiCodeSSlashLine }],
  },
];

/** Texto que some (desfoque + opacidade + largura) quando o menu recolhe; os ícones ficam no lugar. */
function Recolhivel({ recolhido, children, className }: { recolhido: boolean; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,filter] duration-300 ease-in-out',
        recolhido ? 'max-w-0 opacity-0 blur-[3px]' : 'max-w-full opacity-100 blur-0',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Com o menu recolhido, o nome aparece num tooltip ao lado do ícone. */
/** O elemento que abre o tooltip (o mesmo tipo que o Focusable do React Aria aceita). */
type Gatilho = ComponentProps<typeof Focusable>['children'];

function ComDica({ recolhido, dica, children }: { recolhido: boolean; dica: string; children: Gatilho }) {
  if (!recolhido) return <>{children}</>;
  return (
    <TooltipTrigger delay={150}>
      <Focusable>{children}</Focusable>
      <Tooltip placement="end">{dica}</Tooltip>
    </TooltipTrigger>
  );
}

function ItemDeNavegacao({ item, recolhido, aoNavegar }: { item: ItemDoMenu; recolhido: boolean; aoNavegar?: () => void }) {
  const { icone: IconeDoItem } = item;
  // O NavLink repassa ref e eventos para o <a>, então serve de gatilho do tooltip como um elemento comum
  const link = (
    <NavLink
      to={item.caminho}
      onClick={aoNavegar}
      aria-label={recolhido ? item.rotulo : undefined}
      className={({ isActive }) =>
        cx(
          'group/item flex items-center gap-2 overflow-hidden rounded-2lg p-2 outline-none',
          'transition-[width,background-color] duration-300 ease-in-out',
          'focus-visible:ring-2 focus-visible:ring-border-focus-ring',
          recolhido ? 'w-9' : 'w-full',
          isActive
            ? 'bg-linear-to-b from-accent-500 to-accent-600 shadow-nav-selected'
            : 'hover:bg-background-secondary-hover active:bg-background-tertiary-default',
        )
      }
    >
      {({ isActive }) => (
        <>
          <IconeDoItem
            className={cx(
              'size-5 shrink-0 transition-colors duration-150',
              isActive ? 'text-white' : 'text-foreground-icon-secondary group-hover/item:text-foreground-icon-primary',
            )}
            aria-hidden
          />
          <Recolhivel recolhido={recolhido}>
            <span className={cx('text-body-medium whitespace-nowrap', isActive ? 'text-white' : 'text-text-secondary')}>{item.rotulo}</span>
          </Recolhivel>
        </>
      )}
    </NavLink>
  ) as unknown as Gatilho;
  return (
    <ComDica recolhido={recolhido} dica={item.rotulo}>
      {link}
    </ComDica>
  );
}

interface PropsDoMenu {
  sessao: Sessao | null;
  /** Dentro da gaveta do celular: sempre aberto, com botão de fechar no lugar do de recolher. */
  movel?: boolean;
  recolhido?: boolean;
  aoAlternarRecolhido?: () => void;
  aoFechar?: () => void;
  aoBuscar: () => void;
  aoSair: () => void;
}

/** O menu flutuante do portal, na receita do sidebar do BoardUI (painel arredondado, item escolhido em degradê). */
export function MenuLateral({
  sessao,
  movel = false,
  recolhido: recolhidoPedido = false,
  aoAlternarRecolhido,
  aoFechar,
  aoBuscar,
  aoSair,
}: PropsDoMenu) {
  const recolhido = movel ? false : recolhidoPedido;
  const nome = sessao?.profissional.nome ?? '';
  return (
    <aside
      aria-label="Menu do portal"
      className={cx(
        'flex h-full shrink-0 flex-col justify-between overflow-hidden',
        'rounded-3xl border border-border-button-white bg-background-secondary-default shadow-sidebar',
        'transition-[width] duration-300 ease-in-out',
        recolhido ? 'w-[60px] px-[11px] py-3' : movel ? 'w-full p-3' : 'w-[260px] p-3',
      )}
    >
      <div className="-m-2 flex min-h-0 w-[calc(100%+16px)] flex-col gap-4 overflow-y-auto p-2 [scrollbar-width:none]">
        {/* Marca + recolher */}
        <div
          className={cx(
            'flex w-full transition-[gap] duration-300 ease-in-out',
            recolhido ? 'flex-col-reverse items-start gap-3' : 'flex-row items-center justify-between',
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-b from-accent-500 to-accent-700 shadow-nav-selected">
              <RiHeartPulseFill className="size-5 text-white" aria-hidden />
            </span>
            <Recolhivel recolhido={recolhido} className="flex-col items-start">
              <span className="text-headline-semibold whitespace-nowrap text-text-primary">MedicalField</span>
              <span className="text-caption-1-medium whitespace-nowrap text-text-tertiary">Portal Admin</span>
            </Recolhivel>
          </div>
          {movel ? (
            <button
              type="button"
              aria-label="Fechar o menu"
              onClick={aoFechar}
              className="cursor-pointer rounded-lg p-1 text-foreground-icon-secondary hover:bg-background-secondary-hover"
            >
              <RiCloseLine className="size-5" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              aria-label={recolhido ? 'Expandir o menu' : 'Recolher o menu'}
              aria-expanded={!recolhido}
              onClick={aoAlternarRecolhido}
              className={cx(
                'cursor-pointer rounded-lg text-foreground-icon-secondary outline-none transition-colors duration-150 hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                recolhido && 'flex w-9 items-center justify-center',
              )}
            >
              <RiSideBarFill
                className={cx('size-5 transition-transform duration-300 ease-in-out', recolhido ? '' : '-scale-x-100')}
                aria-hidden
              />
            </button>
          )}
        </div>

        {/* Busca rápida: abre a paleta de comandos */}
        <ComDica recolhido={recolhido} dica="Buscar (Ctrl+K)">
          <button
            type="button"
            onClick={aoBuscar}
            aria-label="Buscar uma tela"
            className={cx(
              'flex cursor-pointer items-center gap-2 rounded-full bg-background-tertiary-default p-2 outline-none',
              'transition-[width,background-color] duration-300 ease-in-out hover:bg-background-tertiary-hover/55',
              'focus-visible:ring-2 focus-visible:ring-border-focus-ring',
              recolhido ? 'w-9' : 'w-full',
            )}
          >
            <span className={cx('flex min-w-0 items-center gap-2', !recolhido && 'flex-1')}>
              <RiSearchLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
              <Recolhivel recolhido={recolhido}>
                <span className="text-body-medium whitespace-nowrap text-text-secondary">Buscar…</span>
              </Recolhivel>
            </span>
            <Recolhivel recolhido={recolhido}>
              <Kbd>Ctrl K</Kbd>
            </Recolhivel>
          </button>
        </ComDica>

        <nav aria-label="Menu principal" className={cx('flex w-full flex-col gap-4', !recolhido && 'px-0.5')}>
          {MENU.map(({ grupo, itens }) => (
            <div key={grupo} className="flex flex-col gap-1">
              <span
                className={cx(
                  'overflow-hidden px-2 text-caption-1-semibold whitespace-nowrap text-text-tertiary transition-[max-height,opacity] duration-300',
                  recolhido ? 'max-h-0 opacity-0' : 'max-h-6 opacity-100',
                )}
              >
                {grupo}
              </span>
              {itens.map((item) => (
                <ItemDeNavegacao key={item.caminho} item={item} recolhido={recolhido} aoNavegar={aoFechar} />
              ))}
            </div>
          ))}
        </nav>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-3 pt-3">
        {recolhido ? <ThemeToggle collapsed /> : <ThemeToggle appearance="sidebar-segmented" />}

        {/* Quem está logado + Sair */}
        <div
          className={cx(
            'flex items-center gap-2 rounded-2xl bg-background-primary-default shadow-card transition-[padding,width] duration-300',
            recolhido ? 'w-9 flex-col bg-transparent p-0 shadow-none' : 'w-full p-2',
          )}
        >
          <Avatar size="md" color="blue" initials={iniciais(nome)} title={recolhido ? nome : undefined} />
          <Recolhivel recolhido={recolhido} className={cx('flex-col items-start', !recolhido && 'flex-1')}>
            <span className="w-full truncate text-body-medium text-text-primary">{nome}</span>
            <span className="w-full truncate text-caption-1-medium text-text-tertiary">
              {sessao ? `${sessao.profissional.tipoRegistro} ${sessao.profissional.registro} · Administrador` : ''}
            </span>
          </Recolhivel>
          <ComDica recolhido={recolhido} dica="Sair">
            <button
              type="button"
              onClick={aoSair}
              aria-label="Sair"
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-foreground-icon-secondary outline-none transition-colors duration-150 hover:bg-background-secondary-hover hover:text-text-error-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              <RiLogoutBoxRLine className="size-[18px]" aria-hidden />
            </button>
          </ComDica>
        </div>
      </div>
    </aside>
  );
}
