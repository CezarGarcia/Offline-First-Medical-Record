import { Alert, Button, Center, Paper, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { IconActivityHeartbeat, IconAlertTriangle } from '@tabler/icons-react';
import { type FormEvent, useState } from 'react';
import { errosPorCampo, mensagemDoErro, nucleo } from '../nucleo';

/** Só na primeira vez (docs/10, seção 10.1): o endereço do servidor e o nome deste aparelho. */
export function Configuracao() {
  const [servidorUrl, setServidorUrl] = useState('');
  const [dispositivoNome, setDispositivoNome] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await nucleo.configurar({ servidorUrl, dispositivoNome });
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Center mih="100vh" bg="gray.0" p="md">
      <Paper withBorder shadow="sm" radius="lg" p="xl" w="100%" maw={480}>
        <form onSubmit={salvar} noValidate>
          <Stack gap="md">
            <Stack gap={4} align="center">
              <ThemeIcon size={48} radius="md">
                <IconActivityHeartbeat size={30} />
              </ThemeIcon>
              <Title order={2}>Configuração inicial</Title>
              <Text c="dimmed" size="sm" ta="center">
                Só na primeira vez. Dá para mudar depois, na tela Sobre.
              </Text>
            </Stack>
            {erro && (
              <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} role="alert">
                {erro}
              </Alert>
            )}
            <TextInput
              label="Endereço do servidor"
              description="O endereço da VM, como no navegador. O app confere no primeiro login."
              placeholder="http://IP-DA-VM"
              value={servidorUrl}
              onChange={(e) => setServidorUrl(e.currentTarget.value)}
              error={erros.servidorUrl}
              required
              autoFocus
            />
            <TextInput
              label="Nome deste dispositivo"
              description="Aparece em cada registro feito aqui (rastreabilidade)."
              placeholder="Ambulância 01"
              value={dispositivoNome}
              onChange={(e) => setDispositivoNome(e.currentTarget.value)}
              error={erros.dispositivoNome}
              required
            />
            <Button type="submit" loading={salvando}>
              Salvar e continuar
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
