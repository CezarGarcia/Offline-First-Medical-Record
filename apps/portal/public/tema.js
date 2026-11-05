// Aplica o tema escolhido (claro/escuro) antes da primeira pintura, sem piscar.
// Fica num arquivo (e não dentro do index.html) porque a política de conteúdo (CSP) do portal não aceita script embutido.
try {
  if (localStorage.getItem('boardui:theme') === 'dark') document.documentElement.classList.add('dark');
} catch {}
