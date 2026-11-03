import { Button, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import { useTitulo } from '../componentes/Pagina';

export function NaoEncontrada() {
  useTitulo('Página não encontrada');
  return (
    <Stack align="center" py={80} gap="sm">
      <Title order={2}>Página não encontrada</Title>
      <Text c="dimmed">O endereço não existe no portal.</Text>
      <Button component={Link} to="/atendimentos" variant="light">
        Ir para os atendimentos
      </Button>
    </Stack>
  );
}
