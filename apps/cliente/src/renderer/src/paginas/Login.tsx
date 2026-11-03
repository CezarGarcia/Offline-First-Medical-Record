import {
  Alert,
  Button,
  Center,
  Group,
  Paper,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconActivityHeartbeat, IconAlertTriangle, IconInfoCircle, IconLock } from '@tabler/icons-react';
import { TIPO_REGISTRO } from '@compartilhado/rotulos';
import type { TipoRegistro } from '@compartilhado/tipos';
import { type FormEvent, useState } from 'react';
import { ChaveDeConectividade } from '../componentes/Estrutura';
import { mensagemDoErro, nucleo, useEstadoDoApp } from '../nucleo';

const EXEMPLO: Record<TipoRegistro, string> = { CRM: 'ex.: 12345-RS', COREN: 'ex.: 543210-RS', SOCORRISTA: 'ex.: SOC-0001' };

export function Login() {
  const estado = useEstadoDoApp();
  const [tipoRegistro, setTipoRegistro] = useState<TipoRegistro>('CRM');
  const [registro, setRegistro] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setEntrando(true);
    setErro(null);
    try {
      const resultado = await nucleo.entrar({ tipoRegistro, registro, senha });
      if (resultado.modo === 'OFFLINE') {
        notifications.show({ color: 'orange', title: 'Entrou em modo offline', message: resultado.aviso ?? 'Tudo será salvo neste aparelho.' });
      }
    } catch (falha) {
      setErro(mensagemDoErro(falha));
      setSenha('');
    } finally {
      setEntrando(false);
    }
  }

  return (
    <Center mih="100vh" bg="gray.0" p="md">
      <Paper withBorder shadow="sm" radius="lg" p="xl" w="100%" maw={440}>
        <form onSubmit={entrar} noValidate>
          <Stack gap="md">
            <Stack gap={4} align="center">
              <ThemeIcon size={48} radius="md">
                <IconActivityHeartbeat size={30} />
              </ThemeIcon>
              <Title order={2}>MedicalField</Title>
              <Text c="dimmed" size="sm">
                {estado?.dispositivo?.nome ?? 'App cliente'}
              </Text>
            </Stack>
            <Group justify="center">
              <ChaveDeConectividade />
            </Group>
            {estado?.motivoDoFimDaSessao && !erro && (
              <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />}>
                {estado.motivoDoFimDaSessao}
              </Alert>
            )}
            {erro && (
              <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} role="alert">
                {erro}
              </Alert>
            )}
            <div>
              <Text size="sm" fw={500} mb={4} id="rotulo-tipo">
                Tipo de registro
              </Text>
              <SegmentedControl
                fullWidth
                aria-labelledby="rotulo-tipo"
                value={tipoRegistro}
                onChange={(valor) => setTipoRegistro(valor as TipoRegistro)}
                data={(Object.keys(TIPO_REGISTRO) as TipoRegistro[]).map((tipo) => ({ value: tipo, label: TIPO_REGISTRO[tipo] }))}
              />
            </div>
            <TextInput
              label="Registro"
              placeholder={EXEMPLO[tipoRegistro]}
              value={registro}
              onChange={(e) => setRegistro(e.currentTarget.value)}
              required
              autoFocus
            />
            <PasswordInput label="Senha" value={senha} onChange={(e) => setSenha(e.currentTarget.value)} required />
            <Button type="submit" loading={entrando} disabled={!registro.trim() || !senha} leftSection={<IconLock size={16} />}>
              Entrar
            </Button>
            <Text size="xs" c="dimmed" ta="center">
              Com a chave em Offline, entra quem já entrou online neste aparelho nos últimos 7 dias.
            </Text>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
