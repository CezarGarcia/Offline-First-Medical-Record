// Desenha as setas entre as caixas. Cada imagem chama setas([...]) com:
//   [id de origem, id de destino, { rotulo, cor, tracejada, de: 'direita'|'esquerda'|'cima'|'baixo', para: ..., curva }]
const LADOS = {
  direita: (r) => [r.right, r.top + r.height / 2, 1, 0],
  esquerda: (r) => [r.left, r.top + r.height / 2, -1, 0],
  cima: (r) => [r.left + r.width / 2, r.top, 0, -1],
  baixo: (r) => [r.left + r.width / 2, r.bottom, 0, 1],
};
function ladoAutomatico(a, b) {
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? ['direita', 'esquerda'] : ['esquerda', 'direita'];
  return dy > 0 ? ['baixo', 'cima'] : ['cima', 'baixo'];
}
window.setas = function setas(lista) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('setas');
  const defs = document.createElementNS(ns, 'defs');
  svg.appendChild(defs);
  document.body.appendChild(svg);
  const marcadores = new Map();
  const marcador = (cor) => {
    if (marcadores.has(cor)) return marcadores.get(cor);
    const id = `ponta${marcadores.size}`;
    const m = document.createElementNS(ns, 'marker');
    m.setAttribute('id', id); m.setAttribute('viewBox', '0 0 10 10'); m.setAttribute('refX', '8'); m.setAttribute('refY', '5');
    m.setAttribute('markerWidth', '5'); m.setAttribute('markerHeight', '5'); m.setAttribute('orient', 'auto-start-reverse');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M0,0 L10,5 L0,10 z'); p.setAttribute('fill', cor);
    m.appendChild(p); defs.appendChild(m); marcadores.set(cor, id);
    return id;
  };
  for (const [deId, paraId, op = {}] of lista) {
    const a = document.getElementById(deId).getBoundingClientRect();
    const b = document.getElementById(paraId).getBoundingClientRect();
    const [ladoA, ladoB] = op.de && op.para ? [op.de, op.para] : ladoAutomatico(a, b);
    const [x1, y1, dx1, dy1] = LADOS[ladoA](a);
    const [x2, y2, dx2, dy2] = LADOS[ladoB](b);
    const curva = op.curva ?? Math.max(60, Math.hypot(x2 - x1, y2 - y1) * 0.4);
    const cor = op.cor ?? '#475569';
    const caminho = document.createElementNS(ns, 'path');
    caminho.setAttribute('d', `M${x1},${y1} C${x1 + dx1 * curva},${y1 + dy1 * curva} ${x2 + dx2 * curva},${y2 + dy2 * curva} ${x2},${y2}`);
    caminho.setAttribute('fill', 'none'); caminho.setAttribute('stroke', cor); caminho.setAttribute('stroke-width', op.espessura ?? 6);
    caminho.setAttribute('stroke-linecap', 'round');
    if (op.tracejada) caminho.setAttribute('stroke-dasharray', '14 12');
    caminho.setAttribute('marker-end', `url(#${marcador(cor)})`);
    if (op.dupla) caminho.setAttribute('marker-start', `url(#${marcador(cor)})`);
    svg.appendChild(caminho);
    if (op.rotulo) {
      const meio = caminho.getPointAtLength(caminho.getTotalLength() * (op.posicao ?? 0.5));
      const r = document.createElement('div');
      r.className = 'rotulo-seta'; r.textContent = op.rotulo; r.style.color = cor;
      r.style.left = `${meio.x + (op.desvioX ?? 0)}px`; r.style.top = `${meio.y + (op.desvioY ?? 0)}px`;
      document.body.appendChild(r);
    }
  }
  document.body.dataset.pronto = '1';
};

// Espera as fontes carregarem (as caixas mudam de tamanho) e desenha as setas
window.desenhar = (lista) => document.fonts.ready.then(() => window.setas(lista));
