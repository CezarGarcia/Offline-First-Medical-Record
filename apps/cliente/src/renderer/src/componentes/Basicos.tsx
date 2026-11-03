/** Peças pequenas usadas em várias telas: selos, valores vazios, grade de campos, seções e títulos. */
import { Alert, Badge, Card, Center, Group, Loader, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { COR, COR_HEX, MODO, PROTOCOLO, rotulo } from '@compartilhado/rotulos';
import type { Modo, Triagem } from '@compartilhado/tipos';
import { type ReactNode, useEffect } from 'react';
import type { EstadoSync, StatusItemDaFila } from '../../../comum/contrato';
import { mensagemDoErro } from '../nucleo';

/** As etiquetas nunca encolhem dentro das tabelas (senão "Concluído" vira "CONC..."). */
export const NAO_ENCOLHE = { root: { overflow: 'visible', flexShrink: 0 }, label: { overflow: 'visible' } } as const;

export function SeloTriagem({ triagem, grande = false }: { triagem: Triagem; grande?: boolean }) {
  const cores = COR_HEX[triagem.cor] ?? { fundo: '#6b7280', texto: '#ffffff' };
  return (
    <Badge
      size={grande ? 'xl' : 'md'}
      radius="sm"
      styles={{ ...NAO_ENCOLHE, root: { ...NAO_ENCOLHE.root, backgroundColor: cores.fundo, color: cores.texto } }}
      title={`Protocolo ${rotulo(PROTOCOLO, triagem.protocolo)}`}
    >
      {rotulo(COR, triagem.cor)}
    </Badge>
  );
}

/** Pendente (ainda não subiu), Sincronizado ou Erro. */
export function SeloSync({ estado }: { estado: EstadoSync }) {
  const { cor, texto, dica } = {
    PENDENTE: { cor: 'orange', texto: 'Pendente', dica: 'Salvo neste aparelho; ainda não chegou ao servidor' },
    SINCRONIZADO: { cor: 'teal', texto: 'Sincronizado', dica: 'O servidor já tem este registro' },
    ERRO: { cor: 'red', texto: 'Erro', dica: 'O servidor recusou: veja a fila de sincronização' },
  }[estado];
  return (
    <Tooltip label={dica} withArrow>
      <Badge variant="light" color={cor} size="sm" styles={NAO_ENCOLHE}>
        {texto}
      </Badge>
    </Tooltip>
  );
}

export function SeloStatusDaFila({ status }: { status: StatusItemDaFila }) {
  const { cor, texto } = {
    PENDENTE: { cor: 'orange', texto: 'Pendente' },
    ENVIANDO: { cor: 'blue', texto: 'Enviando' },
    CONCLUIDO: { cor: 'teal', texto: 'Concluído' },
    ERRO: { cor: 'red', texto: 'Erro' },
  }[status];
  return (
    <Badge variant="light" color={cor} size="sm" styles={NAO_ENCOLHE}>
      {texto}
    </Badge>
  );
}

export function SeloModo({ modo }: { modo: Modo }) {
  return (
    <Badge variant="light" color={modo === 'OFFLINE' ? 'orange' : 'teal'} size="sm" styles={NAO_ENCOLHE}>
      {rotulo(MODO, modo)}
    </Badge>
  );
}

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

export interface Campo {
  rotulo: string;
  valor: ReactNode;
  largo?: boolean;
  destaque?: boolean;
}

export function Campos({ campos, colunas = 3 }: { campos: Campo[]; colunas?: number }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: colunas }} spacing="md" verticalSpacing="sm">
      {campos.map((campo) => (
        <Stack key={campo.rotulo} gap={2} style={campo.largo ? { gridColumn: '1 / -1' } : undefined}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {campo.rotulo}
          </Text>
          <Text component="div" size="sm" fw={campo.destaque ? 700 : 400} style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
            <Valor>{campo.valor}</Valor>
          </Text>
        </Stack>
      ))}
    </SimpleGrid>
  );
}

export function Secao({ titulo, acoes, children }: { titulo: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Title order={4} c="marca.7">
            {titulo}
          </Title>
          {acoes}
        </Group>
        {children}
      </Stack>
    </Card>
  );
}

export function Pagina({ titulo, descricao, acoes, children }: { titulo: string; descricao?: ReactNode; acoes?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    document.title = `${titulo} · MedicalField`;
  }, [titulo]);
  return (
    <Stack gap="md" maw={1300} mx="auto">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Title order={2}>{titulo}</Title>
          {descricao && (
            <Text c="dimmed" size="sm" mt={4}>
              {descricao}
            </Text>
          )}
        </div>
        {acoes && <Group gap="xs">{acoes}</Group>}
      </Group>
      {children}
    </Stack>
  );
}

export function Carregando() {
  return (
    <Center p="xl">
      <Loader aria-label="Carregando" />
    </Center>
  );
}

export function AvisoDeErro({ erro, titulo = 'Não foi possível carregar' }: { erro: unknown; titulo?: string }) {
  return (
    <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title={titulo}>
      {mensagemDoErro(erro)}
    </Alert>
  );
}
