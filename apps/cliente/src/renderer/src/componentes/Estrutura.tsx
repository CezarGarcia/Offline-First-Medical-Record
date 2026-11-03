/**
 * A moldura do app (docs/10, seção 10.1): barra superior sempre visível (dispositivo, profissional, a chave
 * Online/Offline, pendentes, última sincronização, Sincronizar), os avisos e o menu.
 */
import {
  Alert,
  AppShell,
  Badge,
  Button,
  Group,
  Indicator,
  Modal,
  NavLink,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconActivityHeartbeat,
  IconAlertTriangle,
  IconCloudOff,
  IconFirstAidKit,
  IconInfoCircle,
  IconListCheck,
  IconLogout,
  IconNotes,
  IconPlus,
  IconRefresh,
  IconUsers,
  IconWifiOff,
} from '@tabler/icons-react';
import { dataHora } from '@compartilhado/formatos';
import type { Modo } from '@compartilhado/tipos';
import { type ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { mensagemDoErro, nucleo, useEstadoDoApp } from '../nucleo';
import { JanelaSenhaOnline } from './JanelaSenhaOnline';

const MENU = [
  { rotulo: 'Nova ocorrência', caminho: '/nova-ocorrencia', icone: IconPlus },
  { rotulo: 'Pacientes', caminho: '/pacientes', icone: IconUsers },
  { rotulo: 'Atendimentos', caminho: '/atendimentos', icone: IconFirstAidKit },
  { rotulo: 'Fila de sincronização', caminho: '/fila', icone: IconListCheck },
  { rotulo: 'Logs locais', caminho: '/logs', icone: IconNotes },
  { rotulo: 'Sobre', caminho: '/sobre', icone: IconInfoCircle },
];

/** A chave "Simular Conectividade (Online / Offline)" exigida pelo enunciado. */
export function ChaveDeConectividade({ tamanho = 'sm' }: { tamanho?: 'xs' | 'sm' | 'md' }) {
  const estado = useEstadoDoApp();
  return (
    <Tooltip label="Simular conectividade: em Offline, nada sai deste aparelho" withArrow>
      <SegmentedControl
        size={tamanho}
        aria-label="Simular conectividade"
        value={estado?.conectividade ?? 'ONLINE'}
        onChange={(valor) => void nucleo.mudarConectividade(valor as Modo)}
        color={estado?.conectividade === 'OFFLINE' ? 'orange' : 'teal'}
        data={[
          { value: 'ONLINE', label: 'Online' },
          { value: 'OFFLINE', label: 'Offline' },
        ]}
      />
    </Tooltip>
  );
}

export function Estrutura({ children }: { children: ReactNode }) {
  const estado = useEstadoDoApp();
  const local = useLocation();
  const navegar = useNavigate();
  const [saindo, janelaDeSaida] = useDisclosure(false);
  const [senhaAberta, janelaDeSenha] = useDisclosure(false);
  const [sincronizando, setSincronizando] = useState(false);
  if (!estado?.sessao) return null;
  const { sessao, dispositivo } = estado;
  const offline = estado.conectividade === 'OFFLINE';

  async function sincronizar() {
    setSincronizando(true);
    try {
      await nucleo.sincronizar();
      const depois = await nucleo.estado();
      notifications.show({
        color: depois.servidorAcessivel ? 'teal' : 'orange',
        title: depois.servidorAcessivel ? 'Sincronizado' : 'Servidor inacessível',
        message: depois.servidorAcessivel
          ? depois.pendentes === 0
            ? 'Tudo enviado e os dados do servidor recebidos.'
            : `${depois.pendentes} item(ns) ainda na fila.`
          : 'O app tenta de novo sozinho.',
      });
    } catch (erro) {
      notifications.show({ color: 'red', title: 'Não foi possível sincronizar', message: mensagemDoErro(erro) });
    } finally {
      setSincronizando(false);
    }
  }

  async function sair() {
    janelaDeSaida.close();
    await nucleo.sair();
    navegar('/atendimentos');
  }

  return (
    <AppShell header={{ height: 64 }} navbar={{ width: 240, breakpoint: 'xs' }} padding="lg">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon size="lg" radius="md">
              <IconActivityHeartbeat size={22} />
            </ThemeIcon>
            <div>
              <Text fw={700} lh={1.15}>
                {dispositivo?.nome}
              </Text>
              <Text size="xs" c="dimmed" lh={1.15}>
                {sessao.profissional.nome} ({sessao.profissional.tipoRegistro} {sessao.profissional.registro})
              </Text>
            </div>
          </Group>
          <Group gap="md" wrap="nowrap">
            <ChaveDeConectividade />
            <Badge
              size="lg"
              variant={estado.pendentes ? 'filled' : 'light'}
              color={estado.pendentes ? 'orange' : 'gray'}
              component={Link}
              to="/fila"
              style={{ cursor: 'pointer' }}
            >
              {estado.pendentes === 1 ? '1 pendente' : `${estado.pendentes} pendentes`}
            </Badge>
            <Stack gap={0} align="flex-end">
              <Text size="xs" c="dimmed">
                Última sincronização
              </Text>
              <Text size="sm" fw={600}>
                {estado.ultimaSincronizacaoEm ? dataHora(estado.ultimaSincronizacaoEm) : 'nunca'}
              </Text>
            </Stack>
            <Button
              leftSection={<IconRefresh size={16} />}
              onClick={sincronizar}
              loading={sincronizando || estado.sincronizando}
              disabled={offline || sessao.precisaLoginOnline}
            >
              Sincronizar
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <AppShell.Section grow component={ScrollArea}>
          {MENU.map(({ rotulo, caminho, icone: Icone }) => (
            <NavLink
              key={caminho}
              component={Link}
              to={caminho}
              label={rotulo}
              leftSection={
                caminho === '/fila' && estado.itensComErro > 0 ? (
                  <Indicator color="red" size={8} offset={2}>
                    <Icone size={18} stroke={1.6} />
                  </Indicator>
                ) : (
                  <Icone size={18} stroke={1.6} />
                )
              }
              active={local.pathname === caminho || local.pathname.startsWith(`${caminho}/`)}
            />
          ))}
        </AppShell.Section>
        <AppShell.Section>
          <NavLink label="Sair" leftSection={<IconLogout size={18} stroke={1.6} />} onClick={() => (estado.pendentes ? janelaDeSaida.open() : void sair())} />
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main bg="gray.0">
        <Stack gap="sm" maw={1300} mx="auto" mb="md">
          {offline && (
            <Alert color="orange" variant="light" icon={<IconWifiOff size={18} />} p="xs">
              Modo offline: tudo está sendo salvo neste aparelho.
            </Alert>
          )}
          {!offline && !estado.servidorAcessivel && (
            <Alert color="orange" variant="light" icon={<IconCloudOff size={18} />} p="xs">
              Servidor inacessível: tentando de novo…
            </Alert>
          )}
          {sessao.precisaLoginOnline && (
            <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />} p="xs">
              <Group justify="space-between">
                <span>Faça login online para sincronizar. Os registros continuam guardados neste aparelho.</span>
                <Button size="xs" variant="light" onClick={janelaDeSenha.open} disabled={offline}>
                  Entrar online
                </Button>
              </Group>
            </Alert>
          )}
          {estado.itensComErro > 0 && (
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} p="xs">
              <Group justify="space-between">
                <span>
                  {estado.itensComErro === 1 ? '1 item com erro na fila.' : `${estado.itensComErro} itens com erro na fila.`}
                </span>
                <Button size="xs" variant="light" color="red" component={Link} to="/fila">
                  Ver a fila
                </Button>
              </Group>
            </Alert>
          )}
        </Stack>
        {children}
      </AppShell.Main>

      <Modal opened={saindo} onClose={janelaDeSaida.close} title="Sair" centered>
        <Stack>
          <Text size="sm">
            Existem {estado.pendentes} pendentes. Eles continuam guardados e serão enviados por quem entrar em seguida.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={janelaDeSaida.close}>
              Cancelar
            </Button>
            <Button color="red" onClick={sair}>
              Sair mesmo assim
            </Button>
          </Group>
        </Stack>
      </Modal>
      <JanelaSenhaOnline aberta={senhaAberta} aoFechar={janelaDeSenha.close} />
    </AppShell>
  );
}
