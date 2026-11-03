import { Alert, Button, Center, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { type ReactNode, useEffect } from 'react';
import { mensagemDoErro } from '../api/erros';

interface PropsDaPagina {
  titulo: string;
  descricao?: ReactNode;
  /** Botão "Atualizar": busca os dados de novo (docs/10, seção 10.2). */
  aoAtualizar?: () => void;
  atualizando?: boolean;
  acoes?: ReactNode;
  children: ReactNode;
}

export function Pagina({ titulo, descricao, aoAtualizar, atualizando, acoes, children }: PropsDaPagina) {
  useTitulo(titulo);
  return (
    <Stack gap="md" maw={1400} mx="auto">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Title order={2}>{titulo}</Title>
          {descricao && (
            <Text c="dimmed" size="sm" mt={4}>
              {descricao}
            </Text>
          )}
        </div>
        <Group gap="xs">
          {acoes}
          {aoAtualizar && (
            <Button
              variant="default"
              leftSection={<IconRefresh size={16} />}
              loading={atualizando}
              onClick={aoAtualizar}
            >
              Atualizar
            </Button>
          )}
        </Group>
      </Group>
      {children}
    </Stack>
  );
}

export function useTitulo(titulo: string) {
  useEffect(() => {
    document.title = `${titulo} · MedicalField`;
  }, [titulo]);
}

interface ConsultaMinima {
  isPending: boolean;
  isError: boolean;
  error: unknown;
}

/** Enquanto carrega, um indicador; se der erro, a mensagem da API; senão, o conteúdo. */
export function EstadoDaConsulta({ consulta, children }: { consulta: ConsultaMinima; children: () => ReactNode }) {
  if (consulta.isPending) {
    return (
      <Center p="xl">
        <Loader aria-label="Carregando" />
      </Center>
    );
  }
  if (consulta.isError) return <AvisoDeErro erro={consulta.error} />;
  return <>{children()}</>;
}

export function AvisoDeErro({ erro, titulo = 'Não foi possível carregar' }: { erro: unknown; titulo?: string }) {
  return (
    <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title={titulo}>
      {mensagemDoErro(erro)}
    </Alert>
  );
}
