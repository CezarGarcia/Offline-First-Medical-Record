import { Badge, Code, Text, Tooltip } from '@mantine/core';
import { COR, COR_HEX, MODO, PROTOCOLO, rotulo } from '@compartilhado/rotulos';
import type { Modo, Triagem } from '@compartilhado/tipos';
import type { ReactNode } from 'react';

/** A cor da triagem, como etiqueta colorida (as mesmas cores do PDF). */
export function SeloTriagem({ triagem, grande = false }: { triagem: Triagem; grande?: boolean }) {
  const cores = COR_HEX[triagem.cor] ?? { fundo: '#6b7280', texto: '#ffffff' };
  return (
    <Badge
      size={grande ? 'xl' : 'md'}
      radius="sm"
      styles={{ root: { backgroundColor: cores.fundo, color: cores.texto } }}
      title={`Protocolo ${rotulo(PROTOCOLO, triagem.protocolo)}`}
    >
      {rotulo(COR, triagem.cor)}
    </Badge>
  );
}

export function SeloModo({ modo }: { modo: Modo }) {
  return (
    <Badge variant="light" color={modo === 'OFFLINE' ? 'orange' : 'teal'} size="sm">
      {rotulo(MODO, modo)}
    </Badge>
  );
}

export function SeloStatusHttp({ status }: { status: number }) {
  const cor = status >= 500 ? 'red' : status >= 400 ? 'orange' : status >= 300 ? 'blue' : 'teal';
  return (
    <Badge variant="light" color={cor} size="sm" ff="monospace">
      {status}
    </Badge>
  );
}

export function SeloSimNao({ valor, sim = 'Ativo', nao = 'Inativo' }: { valor: boolean; sim?: string; nao?: string }) {
  return (
    <Badge variant="light" color={valor ? 'teal' : 'gray'} size="sm">
      {valor ? sim : nao}
    </Badge>
  );
}

/** Valor de um campo; vazio aparece como "não informado", como no PDF. */
export function Valor({ children, vazio = 'não informado' }: { children: ReactNode; vazio?: string }) {
  if (children === null || children === undefined || children === '') {
    return (
      <Text span c="dimmed" fs="italic" size="sm">
        {vazio}
      </Text>
    );
  }
  return <>{children}</>;
}

/** Um ID encurtado (8 últimos caracteres), com o ID completo ao passar o mouse. */
export function IdCurto({ id }: { id: string | null | undefined }) {
  if (!id) return <Valor vazio="—">{null}</Valor>;
  return (
    <Tooltip label={id} withArrow>
      <Code>{id.replace(/-/g, '').slice(-8).toUpperCase()}</Code>
    </Tooltip>
  );
}
