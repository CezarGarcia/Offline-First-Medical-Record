/**
 * Textos fixos dos componentes do BoardUI, em português. O `TemplateCopyProvider` (foundations/template-copy)
 * passa por aqui todo texto exibido pelos componentes que usam `useTemplateCopy`; o que não estiver na lista
 * aparece como veio. IDs, valores de formulário e dados da API nunca passam por aqui.
 */
const TEXTOS: Record<string, string> = {
  // Seletor de período (date-range-picker)
  Today: 'Hoje',
  Yesterday: 'Ontem',
  'Last week': 'Últimos 7 dias',
  'This month': 'Este mês',
  'Last month': 'Mês passado',
  'This year': 'Este ano',
  'Last year': 'Ano passado',
  'All time': 'Tudo',
  'Start date': 'Data inicial',
  'End date': 'Data final',
  'Date range': 'Período',
  'Select date range': 'Escolha as datas',
  'Previous month': 'Mês anterior',
  'Next month': 'Próximo mês',
  Cancel: 'Cancelar',
  Apply: 'Aplicar',
  // Gerais
  Close: 'Fechar',
  'Dismiss notification': 'Fechar aviso',
  Notifications: 'Avisos',
  'No results': 'Nada encontrado',
  'Clear search': 'Limpar busca',
  Previous: 'Anterior',
  Next: 'Próxima',
  Pagination: 'Paginação',
  Breadcrumb: 'Caminho',
  Loading: 'Carregando',
  // Paleta de comandos
  'Command palette': 'Ir para',
  'Type a command or search…': 'Busque uma tela…',
  'Navigate with ↑ ↓': 'Navegue com ↑ ↓',
  Select: 'Abrir',
  Enter: 'Enter',
  // Tema
  Theme: 'Tema',
  'Use light mode': 'Usar tema claro',
  'Use dark mode': 'Usar tema escuro',
  'Light mode': 'Tema claro',
  'Dark mode': 'Tema escuro',
  Light: 'Claro',
  Dark: 'Escuro',
};

export function traduzir(texto: string): string {
  const direto = TEXTOS[texto];
  if (direto) return direto;
  // "3 days selected" (rodapé do seletor de período)
  const dias = /^(\d+) days? selected$/.exec(texto);
  if (dias) return dias[1] === '1' ? '1 dia escolhido' : `${dias[1]} dias escolhidos`;
  // "Go to page 3" (paginação)
  const pagina = /^Go to page (\d+)$/.exec(texto);
  if (pagina) return `Ir para a página ${pagina[1]}`;
  return texto;
}
