// Boot, plate layout, controls, one frame = hero + B-mode film + drawings + instruments + type. State = the solver
// (sim.js) stepped to film time through a log of commands, so it stays a pure function of t + the log.
// S0.5 look test: the probe cut open on its phantom block, the scan line into the computed B-mode film, four
// instruments, the spec block, four live drawings; the scripted demo (S5) and explode (S4a) come later.

import * as THREE from 'three';
import { initTheme, onTheme, theme, toggleTheme } from './theme.js';
import { initI18n, onLang, t, num, toggleLang } from './i18n.js';
import { createMaterials, setCut, SHARED } from './materials.js';
import { buildProbe, DIM } from './build/probe.js';
import { createHero, VIEWS } from './render/hero.js';
import { createEffects } from './render/effects.js';
import { createDrawings } from './render/drawings.js';
import { createInstruments } from './ui/instruments.js';
import { dim, centre, label } from './ui/dims.js';
import { createClock } from './film.js';
import { createLayout } from './layout.js';
import { bindSlider, bindFader, bindOrbit } from './ui/controls.js';
import { createSim, bmode, scanConvert, sectorPx, toXY, PROBE, PH } from './sim.js';
import { createCallouts } from './ui/callouts.js';

const Q = new URLSearchParams(location.search);
document.documentElement.classList.toggle('rec', Q.has('film'));
initTheme('dark');
await initI18n(Q.get('lang') || 'en');

// ── renderer ────────────────────────────────────────────────────────────────
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.localClippingEnabled = true;
renderer.setClearColor(0x000000, 0);
renderer.autoClear = false;

const M = createMaterials();
const G = buildProbe(M);
const hero = createHero(renderer, G.root);
const fx = createEffects(G.root);

// the cut: the camera-side front quarter of the housing, from just above the lens to the grip (intersection of four
// half-spaces: z > 2 mm, x < 8 mm, 1.5 mm < y < 130 mm); a step deeper the lens opens in front of the layer faces
// (z > 7.3 mm, materials.js), so matching layers and PZT kerfs read face-on. The rest is never cut. No plane on a face.
const CUT = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.002), new THREE.Plane(new THREE.Vector3(1, 0, 0), -0.008),
  new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.0015), new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.13)];
SHARED.uHatchPeriod.value = 0.0016;

// ── drawings ────────────────────────────────────────────────────────────────
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const ovl = (fn) => (c, v, P, tk) => { fn({ c, v, P: (x, y, z) => P(V3(x, y, z)), s: v.s, col: tk['dwg-line'], bg: tk['dwg-paper'], red: tk.accent, tk }); };
const arcPt = (r, a) => [r * Math.sin(a), DIM.cy - r * Math.cos(a)];
const box = (() => { const b = new THREE.Box3(); G.root.updateMatrixWorld(true); b.expandByObject(G.probe); return b; })();
const dwgDefs = {
  // FRONT · sector geometry: the head face-on, the 67.5° sector from the virtual apex, R 50
  front: { dir: V3(0, 0, 1), up: V3(0, 1, 0), frame: () => ({ center: V3(0, 0.005, 0), w: 0.24, h: 0.11 }), pad: 1.04,
    overlay: ovl(({ c, P, s, col, bg, red }) => {
      const z = 0.03, Rr = PROBE.roc / 1000, h = DIM.half, D = 0.055, ap = P(0, DIM.cy, z);
      c.save(); c.strokeStyle = red; c.lineWidth = 0.8 * s; c.setLineDash([3 * s, 2 * s]);
      for (const a of [-h, h]) { c.beginPath(); c.moveTo(...ap); c.lineTo(...P(...arcPt(Rr + D, a), z)); c.stroke(); }
      c.setLineDash([]); c.strokeStyle = col; c.lineWidth = 0.7 * s;
      for (const d of [0.02, 0.04]) { c.beginPath(); for (let i = 0; i <= 40; i++) { const q = P(...arcPt(Rr + d, -h + 2 * h * i / 40), z); i ? c.lineTo(...q) : c.moveTo(...q); } c.stroke(); }
      c.restore();
      dim(c, ap, P(...arcPt(Rr, -0.55), z), { off: 0, text: 'R 50', s, color: col, bg, ext: false });
      const la = P(0, -D * 0.82, z); label(c, '67.5°', la[0], la[1], { s, color: red, size: 9, weight: 700, align: 'center' });
      centre(c, P(0, DIM.cy + 0.004, z), P(0, -D, z), { s, color: col });
    }) },
  // SIDE: the probe lying down, the elevation lens at the nose
  side: { dir: V3(1, 0, 0), up: V3(0, 0, -1), frame: () => ({ center: V3(0, 0.11, 0), w: 0.25, h: 0.075 }), pad: 1.04,
    overlay: ovl(({ c, P, s, col }) => {
      centre(c, P(0, -0.006, 0), P(0, 0.235, 0), { s, color: col });
      const l = P(0, 0.006, 0.03); label(c, t('dwg.elev'), l[0], l[1], { s, color: col, size: 8, align: 'center' });
    }) },
  // ARRAY STACK: section at z = 0 through the centre of the array, macro (≈ 14 mm wide)
  // (cut at z = 7.3 mm: lens and backing in section, the layer faces and the recessed PZT kerfs seen face-on)
  array: { dir: V3(0, 0, 1), up: V3(0, 1, 0), clip: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.0073),
    frame: () => ({ center: V3(0.0030, 0.0030, 0), w: 0.0149, h: 0.0062 }), pad: 1.0,
    overlay: ovl(({ c, P, s, col, red }) => {
      const L = [['dwg.lens', DIM.lens[0] + 0.0006], ['dwg.m2', (DIM.m2[0] + DIM.m2[1]) / 2], ['dwg.m1', (DIM.m1[0] + DIM.m1[1]) / 2], ['dwg.pzt', (DIM.pzt[0] + DIM.pzt[1]) / 2], ['dwg.backing', DIM.pzt[0] - 0.0012]];
      const xr = P(0.0066, 0, 0)[0];
      L.forEach(([k, r], i) => {
        const a = 0.09 - i * 0.004, [x, y] = arcPt(r, a), q = P(x, y, 0.001), ty = 12 * s + i * 18 * s;
        c.strokeStyle = col; c.lineWidth = 0.7 * s; c.beginPath(); c.moveTo(...q); c.lineTo(xr - 6 * s, ty); c.lineTo(xr, ty); c.stroke();
        c.fillStyle = red; c.beginPath(); c.arc(...q, 1.6 * s, 0, Math.PI * 2); c.fill();
        label(c, t(k), xr + 3 * s, ty + 3 * s, { s, color: col, size: 8 });
      });
      const p0 = P(...arcPt(PROBE.roc / 1000, -0.115), 0.001), p1 = P(...arcPt(PROBE.roc / 1000, -0.115 + PROBE.fov / 128), 0.001);
      label(c, '0.46', (p0[0] + p1[0]) / 2, p0[1] + 20 * s, { s, color: red, size: 8, weight: 700, align: 'center' });
    }) },
  // SECTION A-A: the elevation section at x = 0.2 mm, seen from +x
  section: { dir: V3(1, 0, 0), up: V3(0, 1, 0), clip: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.0002),
    frame: () => ({ center: V3(0, 0.019, 0), w: 0.064, h: 0.030 }), pad: 1.04,
    overlay: ovl(({ c, P, s, col, red }) => {
      for (const y of [-0.001, 0.036]) { const a = P(0, y, 0); label(c, 'A', a[0], a[1] + (y < 0 ? 10 : -2) * s, { s, color: red, size: 10, weight: 700, align: 'center' }); }
      centre(c, P(0, -0.003, 0), P(0, 0.035, 0), { s, color: red });
      const l = P(0, 0.003, -0.022); label(c, t('dwg.elev'), l[0], l[1], { s, color: col, size: 8, align: 'center' });
    }) },
};
const drawings = createDrawings(renderer, { subject: G.root, hide: [G.block, G.gel, fx.line, fx.pulse], boxOf: () => box, elements: document.querySelectorAll('.dwg-view'), defs: dwgDefs });
const inst = createInstruments(document.querySelector('.ui'));

onTheme((tk) => {
  hero.setTheme(tk);
  drawings.setTheme(tk);
  SHARED.uHatch.value.set(tk.accent);
  SHARED.uHatchWash.value.set(tk.name === 'dark' ? 0x6a1714 : 0xf0c2bc);
});
onLang(() => { drawings.redrawOverlays(); bmarksKey = ''; });

// ── state: the solver, driven by a log of commands (pure in t: seeking back replays the log from 0) ────────
const DEF = { f: 3.5, lin: false, depth: 160, focus: 70, gain: 0, dr: 60, tgc: [0, 0, 0, 0] };
const P = { ...DEF, tgc: [...DEF.tgc] };
const log = [];
let sim;
function reset() { sim = createSim({ ...DEF, tgc: [...DEF.tgc] }); }
const apply = (c) => (c.k === 'set' ? sim.set(c.p, c.v) : sim[c.k]());
function advance(tt) {
  if (tt < sim.s.t - 1e-9) reset();
  for (const c of log) {
    if (c.t < sim.s.t - 1e-9 || c.done === sim) continue;
    if (c.t > tt + 1e-9) break;
    if (c.t > sim.s.t) sim.step(c.t - sim.s.t);
    apply(c); c.done = sim;
  }
  if (tt > sim.s.t) sim.step(tt - sim.s.t);
}
function cmd(k, p, v) { log.push({ t: now(), k, p, v }); log.sort((a, b) => a.t - b.t); advance(now()); }
function setParam(k, v) { if (P[k] === v) return; P[k] = Array.isArray(v) ? [...v] : v; cmd('set', k, Array.isArray(v) ? [...v] : v); }
const setTgc = (i, v) => { if (P.tgc[i] === v) return; const a = [...P.tgc]; a[i] = v; setParam('tgc', a); };
function resetAll() { for (const k of Object.keys(DEF)) if (JSON.stringify(P[k]) !== JSON.stringify(DEF[k])) setParam(k, DEF[k]); resetOrbit(); }
reset();

// ── the B-mode image: computed once per parameter change (≈ 2 s), never per frame ──
let B = null, bKey = '', bimgKey = '', bmarksKey = '', off = null;
const bParams = (S) => ({ f: S.f, depth: S.depth, focus: S.focus, gain: S.gain, tgcPts: S.tgc });
function ensureB(S, sync) {
  const key = JSON.stringify(bParams(S));
  if (key === bKey) return;
  if (sync || !B) { B = bmode(bParams(S)); bKey = key; bimgKey = ''; return; }
  clearTimeout(ensureB.tm); ensureB.tm = setTimeout(() => { B = bmode(bParams(sim.read())); bKey = JSON.stringify(bParams(sim.read())); bimgKey = ''; clock?.redraw(); }, 250);
}

const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
function state(tt) {
  advance(tt);
  const S = sim.read();
  ensureB(S, clock?.film);
  S.B = B;
  return S;
}

// ── controls ────────────────────────────────────────────────────────────────
const ui = { view: 'cutaway', slow: false, sound: false, orbit: { az: 0, el: 0, zoom: 1 } };
let clock;
const now = () => clock?.t ?? 0;
const vs = { prev: 'cutaway', t0: -10, cut: null };
function setView(name) {
  name = VIEWS[name] ? name : 'cutaway';
  if (name === ui.view && vs.t0 > -10) return;
  vs.prev = ui.view; vs.t0 = now(); ui.view = name;
  document.querySelectorAll('.views button').forEach((b) => b.classList.toggle('on', b.dataset.view === ui.view));
}
function applyCut(on) { if (vs.cut === on) return; vs.cut = on; setCut(M, CUT, on); }
function viewPose(A, Bv, u) {
  const mix = (k) => A[k] + (Bv[k] - A[k]) * u;
  return { az: mix('az'), el: mix('el'), zoom: A.zoom * (Bv.zoom / A.zoom) ** u, tx: mix('tx'), ty: mix('ty'), cx: mix('cx'), cy: mix('cy') };
}
function viewState(tt) {
  const u = smooth(vs.t0, vs.t0 + 1.1, tt);
  return { pose: viewPose(VIEWS[vs.prev], VIEWS[ui.view], u), callA: ui.view !== 'housing' ? smooth(vs.t0 + 0.7, vs.t0 + 1.2, tt) : 0 };
}
const toggle = (k, on = !ui[k]) => { ui[k] = on; document.querySelector(`[data-act="${k}"]`).classList.toggle('on', on); };
const resetOrbit = () => { ui.orbit = { az: 0, el: 0, zoom: 1 }; };
setView(Q.get('view') || 'cutaway'); vs.prev = ui.view; vs.t0 = -10;

const FSTEP = [2, 2.5, 3, 3.5, 4, 4.5, 5];
const SL = {
  f: bindSlider(document.querySelector('[data-key="f"]'), { min: 2, max: 5, snap: (v) => Math.round(v * 2) / 2, get: () => P.f, set: (v) => setParam('f', v) }),
  depth: bindSlider(document.querySelector('[data-key="depth"]'), { min: 40, max: 300, snap: (v) => Math.round(v / 10) * 10, get: () => P.depth, set: (v) => setParam('depth', v) }),
  focus: bindSlider(document.querySelector('[data-key="focus"]'), { min: 20, max: 150, snap: (v) => Math.round(v / 10) * 10, get: () => P.focus, set: (v) => setParam('focus', v) }),
  gain: bindSlider(document.querySelector('[data-key="gain"]'), { min: -20, max: 20, snap: (v) => Math.round(v), get: () => P.gain, set: (v) => setParam('gain', v) }),
  dr: bindSlider(document.querySelector('[data-key="dr"]'), { min: 40, max: 80, snap: (v) => Math.round(v / 5) * 5, get: () => P.dr, set: (v) => setParam('dr', v) }),
};
void FSTEP;
document.querySelector('[data-act="lin"]').onclick = () => setParam('lin', !P.lin);
const tgcEl = document.getElementById('tgc-sl');
tgcEl.innerHTML = [0, 1, 2, 3].map((i) => `<div><i><b></b></i><span><em>T${i + 1}</em><em class="tv"></em></span></div>`).join('');
tgcEl.querySelectorAll('div').forEach((d, i) => bindFader(d, { min: -20, max: 20, snap: (v) => Math.round(v), get: () => P.tgc[i], set: (v) => setTgc(i, v) }));
const knob = document.querySelector('[data-act="freeze"]');
const pressKnob = () => (sim.read().frozen ? cmd('scan') : cmd('freeze'));
knob.onclick = pressKnob;
knob.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pressKnob(); } };
document.querySelectorAll('.views button').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
document.querySelector('[data-act="slow"]').onclick = () => toggle('slow');
document.querySelector('[data-act="sound"]').onclick = () => toggle('sound');
document.querySelector('[data-act="reset"]').onclick = resetAll;
document.querySelector('[data-act="theme"]').onclick = () => toggleTheme();
document.querySelector('[data-act="lang"]').onclick = () => toggleLang();
const KEYVIEW = ['housing', 'cutaway', 'beam', 'array', 'section'];
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('[role="slider"]')) return;
  if (e.key === ' ' && !e.target.closest?.('button, .knob')) { e.preventDefault(); pressKnob(); }
  else if (KEYVIEW[+e.key - 1]) setView(KEYVIEW[+e.key - 1]);
  else if (e.key === 's' || e.key === 'S') toggle('slow');
  else if (e.key === 't' || e.key === 'T') toggleTheme();
  else if (e.key === 'l' || e.key === 'L') toggleLang();
  else if (e.key === 'm' || e.key === 'M') toggle('sound');
  else if (e.key === 'r' || e.key === 'R') resetAll();
});
bindOrbit(document.getElementById('stage'), {
  drag: (dx, dy) => { const o = ui.orbit; o.az += dx * 0.3; o.el = Math.min(30, Math.max(-12, o.el + dy * 0.2)); },
  wheel: (dy) => { const o = ui.orbit; o.zoom = Math.min(1.8, Math.max(0.7, o.zoom * Math.exp(-dy * 0.001))); },
});
window.__plate = { set: setParam, tgc: setTgc, resetAll, freeze: () => cmd('freeze'), scan: () => cmd('scan'), view: setView,
  slow: (on) => toggle('slow', on), orbit: (o) => Object.assign(ui.orbit, o), reset: resetOrbit, P, ui, get sim() { return sim; }, debug: { G, hero, fx, drawings, get B() { return B; } } };

// ── layout ──────────────────────────────────────────────────────────────────
const stage = document.getElementById('stage');
const L = createLayout({ plates: [...document.querySelectorAll('.plate')], renderer, onChange: () => { bimgKey = ''; clock?.film && clock.redraw(); } });
onLang(() => L.apply());
document.fonts.ready.then(() => L.apply());

// ── the B-mode film: the scan-converted image (cached), depth ruler, labels; the red line into it ──
const film = document.getElementById('bfilm'), bimg = document.getElementById('bimg'), ruler = document.getElementById('ruler');
const bmarks = document.getElementById('bmarks'), link = document.getElementById('link');
const TOP = 26;                                         // plate px above the face line (title)
function filmGeom() { const W = film.offsetWidth, H = film.offsetHeight; return { W, H, px: sectorPx(B.depth, W, H, TOP) }; }
/** sector (x, y mm below the skin) → film plate px */
const toFilm = (g, x, y) => [g.W / 2 + x / g.px, TOP + y / g.px];
function drawFilm(S) {
  if (!B) return;
  const g = filmGeom(), k = Math.min(window.devicePixelRatio || 1, 2) * L.scale, W = Math.round(g.W * k), H = Math.round(g.H * k);
  const key = `${bKey}-${S.dr}-${W}-${H}`;
  if (key !== bimgKey) {
    off = document.createElement('canvas'); off.width = W; off.height = H;
    const img = new ImageData(scanConvert(B, W, H, { top: TOP * k, dr: S.dr }), W, H); off.getContext('2d').putImageData(img, 0, 0);
    bimgKey = key; bmarksKey = '';
  }
  if (bimg.width !== W || bimg.height !== H) { bimg.width = W; bimg.height = H; }
  const c = bimg.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); c.drawImage(off, 0, 0);
  // the sweep: the line being fired now, a faint bright stroke (drawn at 1/100 speed)
  c.setTransform(k, 0, 0, k, 0, 0);
  if (!S.frozen) {
    const th = -PROBE.fov / 2 + PROBE.fov * (S.line + 0.5) / PROBE.lines;
    const a = toFilm(g, ...toXY(th, 0)), b = toFilm(g, ...toXY(th, B.depth));
    c.strokeStyle = 'rgba(220, 240, 255, 0.28)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke();
  }
  // transmit focus: a small red mark on the right edge at the focal depth, as on a scanner
  const fy = TOP + S.focus / g.px;
  if (S.focus < B.depth) { c.fillStyle = 'rgba(255, 58, 50, 0.95)'; c.beginPath(); c.moveTo(g.W - 34, fy); c.lineTo(g.W - 27, fy - 4); c.lineTo(g.W - 27, fy + 4); c.fill(); }
  // the red line through the stone
  const a = toFilm(g, ...toXY(S.stone.th, 0)), b = toFilm(g, ...toXY(S.stone.th, B.depth));
  c.strokeStyle = 'rgba(255, 58, 50, 0.9)'; c.lineWidth = 1; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.setLineDash([]);
  if (bmarksKey !== `${bimgKey}-${document.documentElement.lang}`) marks(g);
}
function marks(g) {
  bmarksKey = `${bimgKey}-${document.documentElement.lang}`;
  // depth ruler: along the centre line, a tick per cm, a number per 5 cm
  let r = '';
  for (let cm = 0; cm * 10 <= B.depth; cm++) {
    const y = TOP + (cm * 10) / g.px, big = cm % 5 === 0;
    r += `<i class="${big ? 'big' : ''}" style="top:${y}px"></i>${big ? `<b style="top:${y}px">${cm}</b>` : ''}`;
  }
  ruler.innerHTML = r + `<b style="top:${g.H - 12}px">cm</b>`;
  const lab = (x, y, tx, ty, key, anchor = 'start') => { const [ax, ay] = toFilm(g, x, y); const q = [ax + tx, ay + ty];
    return `<path d="M${ax} ${ay} L${q[0]} ${q[1]}"/><circle cx="${ax}" cy="${ay}" r="1.8"/><text x="${q[0] + (anchor === 'end' ? -4 : 4)}" y="${q[1] + 3.5}" text-anchor="${anchor}">${t(key)}</text>`; };
  const { gb, stone: st, kidney: kd } = PH;
  bmarks.innerHTML = lab(gb.x - 14, gb.y - 2, -70, -34, 'b.gb', 'end') + lab(st.x + 4, st.y - 6, 60, -16, 'b.stone')
    + lab(st.x - 1, st.y + 34, -64, 22, 'b.shadow', 'end') + lab(kd.x + 6, kd.y, 52, 26, 'b.kidney') + lab(-55, 40, -30, -24, 'b.liver', 'end');
}
function drawLink(S, rect, sr, s) {
  // hero: the line's end at the bottom of the block → film: the face point of the same line
  if (!B) return;
  const th = S.stone.th, R = DIM.cy, bot = V3(R * Math.sin(th) + Math.tan(th) * -DIM.floor, DIM.floor + 0.001, 0);
  const q = hero.project(bot, rect), hx = (q.x - sr.left) / s, hy = (q.y - sr.top) / s;
  const g = filmGeom(), [fx0, fy0] = toFilm(g, ...toXY(th, 0)), x2 = film.offsetLeft + fx0, y2 = film.offsetTop + fy0;
  link.setAttribute('viewBox', `0 0 ${stage.offsetWidth} ${stage.offsetHeight}`);
  link.innerHTML = `<path class="dash" d="M${hx} ${hy} L${x2} ${y2}"/>`;
}

const card = document.getElementById('card');
const narr = document.getElementById('narr');
function drawUI(S) {
  SL.f.draw(P.f, `${num(P.f, 1)} MHz`); SL.depth.draw(P.depth, `${num(P.depth / 10)} cm`); SL.gain.draw(P.gain, `${P.gain > 0 ? '+' : ''}${P.gain} dB`);
  SL.focus.draw(P.focus, `${num(P.focus / 10)} cm`); SL.dr.draw(P.dr, `${P.dr} dB`);
  document.querySelector('[data-act="lin"]').classList.toggle('on', P.lin);
  document.querySelector('[data-key="f"]').classList.toggle('off', P.lin);
  tgcEl.querySelectorAll('div').forEach((d, i) => { d.querySelector('b').style.top = `${50 - S.tgc[i] * 2.5}%`; d.querySelector('.tv').textContent = `${S.tgc[i] > 0 ? '+' : ''}${S.tgc[i]}`; });
  document.querySelector('.knob-cap i').style.transform = `rotate(${S.frozen ? -40 : 40}deg)`;
  document.documentElement.classList.toggle('frozen', S.frozen);
  knob.setAttribute('aria-pressed', S.frozen);
  const rows = [
    ['card.rt', `${num(S.stone.us, 0)} <em>µs</em>`], ['card.depth', `${num(S.stone.d / 10, 1)} <em>cm</em>`],
    ['card.lambda', `${num(S.lambda, 2)} <em>mm</em>`], ['card.fps', `${num(S.fps, 0)} <em>fps</em>`],
    ['card.pen', `${num(S.pen / 10, 0)} <em>cm</em>`],
  ];
  card.innerHTML = rows.map(([k, v]) => `<dt>${t(k)}</dt><dd>${v}</dd>`).join('');
  document.getElementById('pulse-sub').textContent = `${num(S.f, 1)} MHz · −6 dB ${num(S.band[0], 1)}–${num(S.band[1], 1)} MHz`;
  narr.textContent = S.frozen ? t('narr.frozen') : t(`narr.${['scan', 'echo', 'depth', 'stone'][Math.floor(S.t / 4) % 4]}`);
}

// callouts: balloons on the open quarter
const CO = createCallouts({ svg: document.getElementById('leaders'), layer: document.getElementById('callouts'), legend: document.getElementById('legend') });
const ap = (r, a, z) => { const [x, y] = arcPt(r, a); return V3(x, y, z); };
const LABELS = [
  { id: 'housing', key: 'b.housing', local: V3(0.027, 0.075, 0.011), side: 1 },
  { id: 'lens', key: 'b.lens', local: ap(0.0512, 0.25, 0.009), side: 1 },
  { id: 'match', key: 'b.match', local: ap(0.0503, 0.42, 0.0072), side: 1 },
  { id: 'asic', key: 'b.asic', local: V3(-0.004, 0.056, 0.0032), side: -1 },
  { id: 'flex', key: 'b.flex', local: V3(-0.0295, 0.026, 0.004), side: -1 },
  { id: 'backing', key: 'b.backing', local: ap(0.042, -0.32, 0.0076), side: -1 },
  { id: 'pzt', key: 'b.pzt', local: ap(0.0497, -0.45, 0.0067), side: -1 },
];
function callouts(V, rect, sr, s) {
  const w = stage.offsetWidth, h = stage.offsetHeight;
  if (!(V.callA > 0 && w > 0)) return CO.hide();
  const at = (p) => { const q = hero.project(p, rect); return [(q.x - sr.left) / s, (q.y - sr.top) / s]; };
  CO.labels(LABELS.map((b) => ({ ...b, text: t(b.key), at: at(b.local) })), { w, h, a: V.callA, top: 24, bottom: h - film.offsetTop + 8, inset: 12 });
}

// ── one frame ───────────────────────────────────────────────────────────────
function frame(tt) {
  const S = state(tt);
  const V = viewState(tt);
  applyCut(ui.view !== 'housing');
  hero.setView(V.pose);
  fx.update({ th: S.stone.th, on: ui.view === 'housing' ? 0 : 1, t: S.frozen ? 0.95 : tt });
  const o = ui.orbit, drift = driftAt(tt);
  hero.setExtra({ az: drift.az + o.az, el: o.el, zoom: drift.zoom * o.zoom });

  const vh = window.innerHeight, s = L.scale;
  renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
  const sr = stage.getBoundingClientRect(), rect = { x: sr.left, y: sr.top, w: sr.width, h: sr.height };
  const ppm = 4000 * s * (L.phone ? 0.86 * stage.offsetWidth / 758 : 1);
  const centreAt = { x: sr.left + sr.width * V.pose.cx, y: sr.top + sr.height * V.pose.cy };
  if (sr.bottom > 0 && sr.top < vh) hero.render(rect, centreAt, ppm, vh);
  callouts(V, rect, sr, s);
  drawFilm(S);
  drawLink(S, rect, sr, s);
  drawings.render(vh, s);
  inst.draw(S, theme(), s);
  drawUI(S);
}
// camera drift: the 5 s clip turns slowly; live, a ±3° sway
const driftAt = (t) => (clock?.film ? { az: -2 + t * 0.8, zoom: 1 + t * 0.004 } : { az: 3 * Math.sin(t * 0.15), zoom: 1 });

let rate = 1;
clock = createClock(frame, { isLoaded: () => document.fonts.status === 'loaded' && !!B, rate: () => (rate += ((ui.slow ? 0.04 : 1) - rate) * 0.12) });
await document.fonts.ready;
ensureB(sim.read(), true);
clock.start();
