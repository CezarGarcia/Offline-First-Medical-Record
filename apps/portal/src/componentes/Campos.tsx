import { Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { Valor } from './Selos';

export interface Campo {
  rotulo: string;
  valor: ReactNode;
  /** Ocupa a linha inteira (textos longos). */
  largo?: boolean;
  destaque?: boolean;
}

/** Grade de "rótulo em cima, valor embaixo", como nas seções do PDF. */
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

/** Um bloco da tela com título (Paciente, Prontuário, Triagem...). */
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
