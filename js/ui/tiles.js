// Tile colours and labels per value tier.

const PALETTE = {
  2: ['#ff70a6', '#ffffff'],
  4: ['#ff9f1c', '#ffffff'],
  8: ['#ffd23f', '#3a2a00'],
  16: ['#3ddc84', '#05301a'],
  32: ['#1fc8db', '#03282d'],
  64: ['#3a86ff', '#ffffff'],
  128: ['#7b5cff', '#ffffff'],
  256: ['#c450ff', '#ffffff'],
  512: ['#e63946', '#ffffff'],
  1024: ['#a3e635', '#1f2b05'],
  2048: ['#f7c948', '#3a2a00'],
  4096: ['#f1f5ff', '#1b1e26'],
};

export function tileStyle(value) {
  const p = PALETTE[value];
  if (p) return { bg: p[0], fg: p[1] };
  const exp = Math.round(Math.log2(value));
  return { bg: `hsl(${(exp * 53) % 360} 80% 58%)`, fg: '#ffffff' };
}

export function formatValue(value) {
  if (value < 100000) return String(value);
  if (value < 100 * 1048576) return `${Math.round(value / 1024)}K`;
  if (value < 100 * 1073741824) return `${Math.round(value / 1048576)}M`;
  return `${Math.round(value / 1073741824)}G`;
}

export function paintTile(el, value) {
  const s = tileStyle(value);
  const label = formatValue(value);
  el.style.setProperty('--tile-bg', s.bg);
  el.style.setProperty('--tile-fg', s.fg);
  el.textContent = label;
  el.dataset.len = String(label.length);
  el.dataset.value = String(value);
}
