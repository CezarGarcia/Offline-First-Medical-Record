import { RiWifiLine, RiWifiOffLine } from '@remixicon/react';
import type { ReactNode } from 'react';
import { Focusable } from 'react-aria-components';
import { Avatar } from '@/components/base/avatar/avatar';
import { Chip, type ChipColor } from '@/components/base/badges/chip';
import { toast } from '@/components/base/toast/toast';
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip';
import { cx } from '@/utils/cx';
import { COR, COR_HEX, MODO, PROTOCOLO, rotulo } from '@compartilhado/rotulos';
import type { Modo, Triagem } from '@compartilhado/tipos';

/** Cores em que a triagem pede atendimento imediato: o ponto do selo pulsa. */
const GRAVES = new Set(['VERMELHO', 'LARANJA']);

/** A cor da triagem, como etiqueta colorida (as mesmas cores do PDF: são cores clínicas, não do tema). */
export function SeloTriagem({ triagem, grande = false }: { triagem: Triagem; grande?: boolean }) {
  const cores = COR_HEX[triagem.cor] ?? { fundo: '#6b7280', texto: '#ffffff' };
  return (
    <Chip
      variant={grande ? 'subtle' : 'caption'}
      title={`Protocolo ${rotulo(PROTOCOLO, triagem.protocolo)}`}
      className={cx('gap-1.5 shadow-xs', grande ? 'px-3 py-1.5 text-headline-medium' : 'px-2')}
      style={{ backgroundColor: cores.fundo, color: cores.texto }}
    >
      <span
        aria-hidden
        className={cx('rounded-full bg-current opacity-80', grande ? 'size-2' : 'size-1.5', GRAVES.has(triagem.cor) && 'selo-pulsa')}
      />
      {rotulo(COR, triagem.cor)}
    </Chip>
  );
}

export function SeloModo({ modo }: { modo: Modo }) {
  const Icone = modo === 'OFFLINE' ? RiWifiOffLine : RiWifiLine;
  return (
    <Chip variant="caption" color={modo === 'OFFLINE' ? 'orange' : 'lime'} className="gap-1">
      <Icone className="size-3.5" aria-hidden />
      {rotulo(MODO, modo)}
    </Chip>
  );
}

export function SeloStatusHttp({ status }: { status: number }) {
  const cor: ChipColor = status >= 500 ? 'rose' : status >= 400 ? 'orange' : status >= 300 ? 'blue' : 'lime';
  return (
    <Chip variant="caption" color={cor} className="font-mono tabular-nums">
      {status}
    </Chip>
  );
}

export function SeloSimNao({ valor, sim = 'Ativo', nao = 'Inativo' }: { valor: boolean; sim?: string; nao?: string }) {
  return (
    <Chip variant="caption" color={valor ? 'lime' : 'neutral'} className="gap-1.5">
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {valor ? sim : nao}
    </Chip>
  );
}

/** Etiqueta neutra (perfil, entidade, contagem). */
export function Etiqueta({ cor = 'neutral', children }: { cor?: ChipColor; children: ReactNode }) {
  return (
    <Chip variant="caption" color={cor}>
      {children}
    </Chip>
  );
}

/** Valor de um campo; vazio aparece como "não informado", como no PDF. */
export function Valor({ children, vazio = 'não informado' }: { children: ReactNode; vazio?: string }) {
  if (children === null || children === undefined || children === '') {
    return <span className="text-body-regular text-text-tertiary italic">{vazio}</span>;
  }
  return <>{children}</>;
}

/** Texto em fonte de código (método HTTP, ação do cliente, rota). */
export function Codigo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code
      className={cx(
        'rounded-md bg-background-tertiary-default px-1.5 py-0.5 font-mono text-caption-1-medium text-text-secondary',
        className,
      )}
    >
      {children}
    </code>
  );
}

/** Um ID encurtado (8 últimos caracteres). O ID completo aparece ao passar o mouse; o clique copia. */
export function IdCurto({ id }: { id: string | null | undefined }) {
  if (!id) return <Valor vazio="—">{null}</Valor>;
  async function copiar() {
    try {
      await navigator.clipboard.writeText(id ?? '');
      toast.success('ID copiado', { description: id, duration: 2500 });
    } catch {
      // Sem permissão para a área de transferência: o tooltip continua mostrando o ID
    }
  }
  return (
    <TooltipTrigger delay={250}>
      <Focusable>
        <button
          type="button"
          onClick={copiar}
          aria-label={`ID ${id} (clique para copiar)`}
          className="cursor-pointer rounded-md bg-background-tertiary-default px-1.5 py-0.5 font-mono text-caption-1-medium text-text-secondary outline-none transition-colors duration-150 hover:bg-background-tertiary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          {id.replace(/-/g, '').slice(-8).toUpperCase()}
        </button>
      </Focusable>
      <Tooltip>
        <span className="font-mono">{id}</span>
        <span className="block text-text-tertiary">Clique para copiar</span>
      </Tooltip>
    </TooltipTrigger>
  );
}

const CORES_DO_AVATAR = ['blue', 'lime', 'pink'] as const;

/** Iniciais para o avatar, sem o título: "Dr. Ricardo Almeida" → "RA", "João da Silva" → "JS". */
export function iniciais(nome: string): string {
  const partes = nome.split(/\s+/).filter((parte) => parte.length > 2 && !/^(dr|dra|enf|soc|sr|sra)\.?$/i.test(parte));
  const [primeira, ...resto] = partes.length ? partes : [nome];
  return ((primeira?.[0] ?? '') + (resto.length ? (resto[resto.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

/** Nome com avatar de iniciais (a cor sai do nome, sempre a mesma para a mesma pessoa). */
export function NomeComAvatar({ nome, detalhe }: { nome: string; detalhe?: ReactNode }) {
  const cor = CORES_DO_AVATAR[[...nome].reduce((soma, letra) => soma + letra.charCodeAt(0), 0) % CORES_DO_AVATAR.length];
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar size="md" color={cor} initials={iniciais(nome)} className="text-caption-1-semibold" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-body-semibold text-text-primary">{nome}</span>
        {detalhe && <span className="truncate text-caption-1-regular text-text-tertiary">{detalhe}</span>}
      </span>
    </span>
  );
}
