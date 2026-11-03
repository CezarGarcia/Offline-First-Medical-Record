import { AppShell, Badge, Burger, Button, Group, NavLink, ScrollArea, Stack, Text, ThemeIcon } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconActivityHeartbeat,
  IconApi,
  IconArrowsJoin,
  IconDeviceDesktopAnalytics,
  IconFileText,
  IconFirstAidKit,
  IconId,
  IconListDetails,
  IconLogout,
  IconMail,
  IconPill,
  IconUsers,
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { api } from '../api/cliente';
import { useSessao } from '../api/sessao';

interface ItemDoMenu {
  rotulo: string;
  caminho: string;
  icone: ComponentType<{ size?: number; stroke?: number }>;
}

const MENU: { grupo: string; itens: ItemDoMenu[] }[] = [
  {
    grupo: 'Atendimento',
    itens: [
      { rotulo: 'Atendimentos', caminho: '/atendimentos', icone: IconFirstAidKit },
      { rotulo: 'Prontuários', caminho: '/prontuarios', icone: IconFileText },
      { rotulo: 'Pessoas', caminho: '/pessoas', icone: IconUsers },
    ],
  },
  {
    grupo: 'Cadastros de apoio',
    itens: [
      { rotulo: 'Medicamentos', caminho: '/medicamentos', icone: IconPill },
      { rotulo: 'Profissionais', caminho: '/profissionais', icone: IconId },
    ],
  },
  {
    grupo: 'Auditoria',
    itens: [
      { rotulo: 'Logs de acesso', caminho: '/logs/acesso', icone: IconListDetails },
      { rotulo: 'Logs dos clientes', caminho: '/logs/clientes', icone: IconDeviceDesktopAnalytics },
      { rotulo: 'Conflitos', caminho: '/conflitos', icone: IconArrowsJoin },
      { rotulo: 'E-mails enviados', caminho: '/emails', icone: IconMail },
    ],
  },
  {
    grupo: 'Documentação',
    itens: [{ rotulo: 'API (Swagger)', caminho: '/documentacao', icone: IconApi }],
  },
];

export function Layout() {
  const sessao = useSessao();
  const [menuAberto, { toggle, close }] = useDisclosure(false);
  const local = useLocation();
  const navegar = useNavigate();

  async function sair() {
    await api.logout();
    navegar('/login', { replace: true });
  }

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !menuAberto } }}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={menuAberto} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Abrir o menu" />
            <ThemeIcon size="lg" radius="md">
              <IconActivityHeartbeat size={22} />
            </ThemeIcon>
            <div>
              <Text fw={700} lh={1.1}>
                MedicalField
              </Text>
              <Text size="xs" c="dimmed" lh={1.1}>
                Portal Admin
              </Text>
            </div>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Stack gap={0} align="flex-end" visibleFrom="xs">
              <Text size="sm" fw={600}>
                {sessao?.profissional.nome}
              </Text>
              <Text size="xs" c="dimmed">
                {sessao?.profissional.tipoRegistro} {sessao?.profissional.registro}
              </Text>
            </Stack>
            <Badge variant="light" visibleFrom="md">
              Administrador
            </Badge>
            <Button variant="default" size="xs" leftSection={<IconLogout size={16} />} onClick={sair}>
              Sair
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <ScrollArea type="auto">
          <nav aria-label="Menu principal">
            {MENU.map(({ grupo, itens }) => (
              <Stack key={grupo} gap={2} mb="sm">
                <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" pt="xs">
                  {grupo}
                </Text>
                {itens.map(({ rotulo, caminho, icone: Icone }) => (
                  <NavLink
                    key={caminho}
                    component={Link}
                    to={caminho}
                    label={rotulo}
                    leftSection={<Icone size={18} stroke={1.6} />}
                    active={local.pathname === caminho || local.pathname.startsWith(`${caminho}/`)}
                    onClick={close}
                  />
                ))}
              </Stack>
            ))}
          </nav>
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main bg="gray.0">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
