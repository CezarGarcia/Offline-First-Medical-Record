import { RiContrast2Line, RiHeartPulseFill, RiLogoutBoxRLine, RiMenuLine, RiSearchLine } from '@remixicon/react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { applyThemeWithTransition, useThemeMode } from '@/components/application/theme/theme-toggle';
import { Button } from '@/components/base/buttons/button';
import { CommandPalette, CommandPaletteItem, CommandPaletteSection } from '@/components/base/command-palette/command-palette';
import { Drawer } from '@/components/base/drawer/drawer';
import { api } from '../api/cliente';
import { useSessao } from '../api/sessao';
import { MENU, MenuLateral } from './MenuLateral';

const CHAVE_DO_MENU_RECOLHIDO = 'medicalfield:menu-recolhido';

function lerRecolhido(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_DO_MENU_RECOLHIDO) === '1';
  } catch {
    return false;
  }
}

export function Layout() {
  const sessao = useSessao();
  const local = useLocation();
  const navegar = useNavigate();
  const tema = useThemeMode();
  const [recolhido, setRecolhido] = useState(lerRecolhido);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);

  // Trocou de página: a gaveta do celular fecha
  useEffect(() => {
    setGavetaAberta(false);
  }, [local.pathname]);

  function alternarRecolhido() {
    setRecolhido((atual) => {
      try {
        window.localStorage.setItem(CHAVE_DO_MENU_RECOLHIDO, atual ? '0' : '1');
      } catch {
        // Sem armazenamento local: só não lembra na próxima visita
      }
      return !atual;
    });
  }

  async function sair() {
    await api.logout();
    navegar('/login', { replace: true });
  }

  function abrirBusca() {
    setGavetaAberta(false);
    setBuscaAberta(true);
  }

  const propsDoMenu = { sessao, aoBuscar: abrirBusca, aoSair: sair };

  return (
    <div className="flex min-h-dvh bg-background-full">
      {/* Computador: menu flutuante fixo à esquerda */}
      <div className="sticky top-0 hidden h-dvh shrink-0 p-3 pe-0 lg:block">
        <MenuLateral {...propsDoMenu} recolhido={recolhido} aoAlternarRecolhido={alternarRecolhido} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Celular e tablet: barra no topo com o botão do menu */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-separator-border bg-background-full/85 px-4 py-2.5 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="small"
              iconOnly
              leadingIcon={RiMenuLine}
              aria-label="Abrir o menu"
              onClick={() => setGavetaAberta(true)}
            />
            <span className="flex size-8 items-center justify-center rounded-lg bg-linear-to-b from-accent-500 to-accent-700">
              <RiHeartPulseFill className="size-[18px] text-white" aria-hidden />
            </span>
            <span className="text-headline-semibold text-text-primary">MedicalField</span>
          </div>
          <Button variant="secondary" size="small" iconOnly leadingIcon={RiSearchLine} aria-label="Buscar uma tela" onClick={abrirBusca} />
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>

      <Drawer
        isOpen={gavetaAberta}
        onOpenChange={setGavetaAberta}
        placement="start"
        size="sm"
        aria-label="Menu do portal"
        className="border-0 bg-transparent p-0 shadow-none"
      >
        <MenuLateral {...propsDoMenu} movel aoFechar={() => setGavetaAberta(false)} />
      </Drawer>

      {/* Ctrl/⌘+K em qualquer tela: ir direto para outra página */}
      <CommandPalette
        isOpen={buscaAberta}
        onOpenChange={setBuscaAberta}
        placeholder="Busque uma tela ou ação…"
        aria-label="Ir para"
        emptyState="Nenhuma tela com esse nome"
        onAction={(chave) => {
          const acao = String(chave);
          setBuscaAberta(false);
          if (acao === 'tema') void applyThemeWithTransition(tema === 'dark' ? 'light' : 'dark');
          else if (acao === 'sair') void sair();
          else navegar(acao);
        }}
      >
        {MENU.map(({ grupo, itens }) => (
          <CommandPaletteSection key={grupo} title={grupo}>
            {itens.map((item) => (
              <CommandPaletteItem
                key={item.caminho}
                id={item.caminho}
                icon={item.icone}
                description={local.pathname.startsWith(item.caminho) ? 'Você está aqui' : undefined}
              >
                {item.rotulo}
              </CommandPaletteItem>
            ))}
          </CommandPaletteSection>
        ))}
        <CommandPaletteSection title="Ações">
          <CommandPaletteItem id="tema" icon={RiContrast2Line}>
            {tema === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
          </CommandPaletteItem>
          <CommandPaletteItem id="sair" icon={RiLogoutBoxRLine}>
            Sair do portal
          </CommandPaletteItem>
        </CommandPaletteSection>
      </CommandPalette>
    </div>
  );
}
