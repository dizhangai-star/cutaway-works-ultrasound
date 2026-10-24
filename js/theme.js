// Theme tokens: one source (css/theme.css) for CSS, three.js, Canvas instruments and drawing shaders.
// Generic: `?theme=light|dark`, default from the page's data-theme. No subject-specific code here.

const listeners = new Set();
let tokens = {};

export function initTheme(def = 'dark') {
  const q = new URLSearchParams(location.search).get('theme');
  setTheme(q === 'light' || q === 'dark' ? q : (document.documentElement.dataset.theme || def));
}

export function setTheme(name) {
  document.documentElement.dataset.theme = name;
  const cs = getComputedStyle(document.documentElement);
  tokens = { name };
  for (const k of ['paper', 'paper-glow', 'paper-edge', 'ink', 'ink-2', 'grid', 'grid-strong', 'rule', 'rule-soft', 'accent',
    'hot-0', 'hot-1', 'hot-2', 'dwg-line', 'dwg-dot', 'dwg-paper', 'dwg-grid', 'shadow', 'shadow-opacity', 'exposure']) {
    tokens[k] = cs.getPropertyValue('--' + k).trim();
  }
  listeners.forEach((f) => f(tokens));
}

export const theme = () => tokens;
export const onTheme = (f) => { listeners.add(f); if (tokens.name) f(tokens); };
export const toggleTheme = () => setTheme(tokens.name === 'dark' ? 'light' : 'dark');

/** '#rrggbb' or 'rgba(r,g,b,a)' → [r, g, b] in 0..1 (sRGB) */
export function rgb(css) {
  if (css.startsWith('#')) { const n = parseInt(css.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  const m = css.match(/[\d.]+/g).map(Number); return [m[0] / 255, m[1] / 255, m[2] / 255];
}
