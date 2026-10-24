// Boot, plate layout, controls, one frame = hero + drawings + instruments + type. State = the solver (sim.js)
// stepped to film time through a log of commands, so it stays a pure function of t + the log.

import * as THREE from 'three';
import { initTheme, onTheme, theme, toggleTheme } from './theme.js';
import { initI18n, onLang, t, num, toggleLang } from './i18n.js';
import { createMaterials, setCut, hideRemoved, SHARED } from './materials.js';
import { buildTube, DIM } from './build/tube.js';
import { createHero, VIEWS } from './render/hero.js';
import { createEffects } from './render/effects.js';
import { createDrawings } from './render/drawings.js';
import { createInstruments } from './ui/instruments.js';
import { dim, centre, label } from './ui/dims.js';
import { createClock } from './film.js';
import { loadDemo, createDemo } from './demo.js';
import { setAt, viewAt } from './demo-plan.js';
import { createLayout } from './layout.js';
import { bindSlider, bindOrbit, sig2 } from './ui/controls.js';
import { createSim, entranceDose, CHEST } from './sim.js';
import { createCallouts } from './ui/callouts.js';
import { createGhost } from './render/ghost.js';
import { createExplode } from './render/explode.js';
import { createSpinBlur } from './render/spinblur.js';
import { explodeGroups, explodeObstacles, BALLOONS, beamKeep } from './build/parts.js';
import { buildSetup, SETUP } from './build/phantom.js';
import { createRadiograph } from './render/radiograph.js';

const Q = new URLSearchParams(location.search);
document.documentElement.classList.toggle('rec', Q.has('film'));   // recording: hide page-only controls (the globe)
// the scripted demo (S5): on for the real render (render.mjs passes shot=main) or with ?demo
const DEMO = Q.has('film') && (Q.get('shot') === 'main' || Q.has('demo')) ? await loadDemo() : null;
document.documentElement.classList.toggle('demo', !!DEMO);
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
const tube = buildTube(M);
const hero = createHero(renderer, tube);
const fx = createEffects(hero.scene);
tube.housing.getObjectByName('oil').userData.noDrawing = true;
const ghost = createGhost(tube.root, beamKeep);
const explode = createExplode(tube.root, explodeGroups(tube), { obstacles: explodeObstacles(tube), frame: tube.stand.children });
const spinBlur = createSpinBlur(tube.blur);
// the filament's glow, seen from outside the cup: a soft additive halo at the cup mouth, as bright as the solver's
// filament temperature (the coils themselves face the anode, out of the camera's sight)
const cupGlow = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,244,220,1)'); r.addColorStop(0.18, 'rgba(255,214,150,0.75)'); r.addColorStop(0.5, 'rgba(255,160,70,0.22)'); r.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
  sp.scale.setScalar(0.026); sp.position.set(0.0025, 0, 0); sp.renderOrder = 20; sp.name = 'filament glow'; sp.userData.noAudit = true;
  tube.cup.add(sp); return sp;
})();
// the use shot's set (view 5): column, phantom, detector; the radiograph bakes its path maps once from it
const setup = buildSetup();
hero.scene.add(setup.root); setup.root.visible = false;
const xr = createRadiograph(renderer, setup);
const feet = tube.stand.children.filter((o) => o.name === 'foot');
const IMG_BALLOONS = [
  { n: 1, key: 'i.phantom', at: setup.toWorld(setup.anchors.shell), dir: [-1, -0.2] },
  { n: 2, key: 'i.lung', at: setup.toWorld(setup.anchors.lung), dir: [-1, -1.2] },
  { n: 3, key: 'i.spine', at: setup.toWorld(setup.anchors.spine), dir: [0.4, -1] },
  { n: 4, key: 'i.heart', at: setup.toWorld(setup.anchors.heart), dir: [1, 0.3] },
  { n: 5, key: 'i.det', at: setup.anchors.det, dir: [-0.6, 1] },
];

// the cutaway: a window cut out of the near half of the housing (intersection of four half-spaces)
// S2a: opened to both seals (x ±0.214) and most of the near half's height, so the whole insert reads
const CUT = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), -0.214),
  new THREE.Plane(new THREE.Vector3(1, 0, 0), -0.208), new THREE.Plane(new THREE.Vector3(0, -1, 0), -0.052), new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.062)];

// ── drawings ────────────────────────────────────────────────────────────────
const H = DIM.len / 2, V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const housingBox = (() => {
  const b = new THREE.Box3();
  tube.root.updateMatrixWorld(true);
  b.expandByObject(tube.housing.getObjectByName('housing shell'));
  b.expandByObject(tube.stand);
  b.expandByPoint(V3(-H - 0.014, 0, 0)); b.expandByPoint(V3(H + 0.016, 0, 0));
  return b;
})();
const ovl = (fn) => (c, v, P, tk) => { const s = v.s, col = tk['dwg-line'], bg = tk['dwg-paper']; fn({ c, v, P: (x, y, z) => P(V3(x, y, z)), s, col, bg, red: tk.accent, tk }); };
const dwgDefs = {
  front: { dir: V3(0, 0, 1), up: V3(0, 1, 0), pad: 1.5,
    overlay: ovl(({ c, P, s, col, bg }) => {
      centre(c, P(-H - 0.03, 0, 0), P(H + 0.03, 0, 0), { s, color: col });
      centre(c, P(0, 0.09, 0), P(0, DIM.floor - 0.01, 0), { s, color: col });
      dim(c, P(-H, 0.076, 0), P(H, 0.076, 0), { off: 9, text: '476', s, color: col, side: -1, bg });
      dim(c, P(-H - 0.02, -0.070, 0), P(-H - 0.02, 0.070, 0), { off: 6, text: 'Ø 140', s, color: col, bg, ext: false });
    }) },
  side: { dir: V3(-1, 0, 0), up: V3(0, 1, 0), pad: 1.75,
    overlay: ovl(({ c, P, s, col, bg }) => {
      centre(c, P(0, 0, -0.1), P(0, 0, 0.1), { s, color: col });
      centre(c, P(0, 0.1, 0), P(0, DIM.floor - 0.01, 0), { s, color: col });
      dim(c, P(0, 0.0762, 0.0762), P(0, 0.0762, -0.0762), { off: 12, text: 'Ø 152.4', s, color: col, bg });
    }) },
  plan: { dir: V3(0, 1, 0), up: V3(0, 0, -1), pad: 1.3,
    frame: (b) => ({ center: V3(0, 0, -0.02), w: 0.53, h: 0.30 }),
    overlay: ovl(({ c, P, s, col, bg, red }) => {
      centre(c, P(-H - 0.03, 0, 0), P(H + 0.03, 0, 0), { s, color: col });
      centre(c, P(0, 0, 0.12), P(0, 0, -0.17), { s, color: red });
      dim(c, P(-0.1345, 0, -0.16), P(0, 0, -0.16), { off: 4, text: '134.5', s, color: col, side: -1, bg });
      dim(c, P(0, 0, -0.16), P(0.1465, 0, -0.16), { off: 4, text: '146.5', s, color: col, side: -1, bg });
    }) },
  section: { dir: V3(0, 0, 1), up: V3(0, 1, 0), pad: 1.5, clip: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
    overlay: ovl(({ c, P, s, col, bg, red }) => {
      centre(c, P(-H - 0.03, 0, 0), P(H + 0.03, 0, 0), { s, color: col });
      // central ray and the beam edges (12.1° half angle)
      const L = 0.12, w = L * 0.2144;
      c.save(); c.strokeStyle = red; c.lineWidth = 0.8 * s; c.setLineDash([3 * s, 2 * s]);
      c.beginPath(); c.moveTo(...P(0, -0.03, 0)); c.lineTo(...P(-w, -0.03 - L, 0)); c.moveTo(...P(0, -0.03, 0)); c.lineTo(...P(w, -0.03 - L, 0)); c.stroke(); c.restore();
      centre(c, P(0, 0.09, 0), P(0, -0.16, 0), { s, color: red });
      dim(c, P(-H, 0.076, 0), P(0, 0.076, 0), { off: 9, text: '237', s, color: col, side: -1, bg });
      dim(c, P(0, 0.076, 0), P(H, 0.076, 0), { off: 9, text: '239', s, color: col, side: -1, bg });
      const a = P(-0.03, -0.16, 0); label(c, 'A', P(-H - 0.035, 0.02, 0)[0], a[1], { s, color: red, size: 10, weight: 700 });
      label(c, 'A', P(H + 0.03, 0.02, 0)[0], a[1], { s, color: red, size: 10, weight: 700 });
    }) },
};
const drawings = createDrawings(renderer, { subject: tube.root, boxOf: () => housingBox, hide: tube.cables, elements: document.querySelectorAll('.dwg-view'), defs: dwgDefs });
const inst = createInstruments(document.querySelector('.ui'));

onTheme((tk) => {
  hero.setTheme(tk);
  drawings.setTheme(tk);
  SHARED.uHatch.value.set(tk.accent);
  SHARED.uHatchWash.value.set(tk.name === 'dark' ? 0x6a1714 : 0xf0c2bc);
});
onLang(() => { drawings.redrawOverlays(); });

// ── state: the solver, driven by a log of commands (pure in t: seeking back replays the log from 0) ────────
const DEF = { kv: 120, ma: 100, ms: 4000, focus: 'auto' };            // 12 kW for 4 s: inside the large-focus rating (≈ 19 kW at 4 s)
const P = { ...DEF };                                  // set values (sliders); the solver holds its own copy
const log = [];                                        // { t, k, v }: k = expose | release | set
const HIST = 1 / 30, FADE = 0.12;
let sim, hist, next;
function reset() { sim = createSim({ ...DEF }); hist = []; next = 0; }
const apply = (c) => (c.k === 'set' ? sim.set(c.p, c.v) : sim[c.k]());
function advance(tt) {
  if (tt < sim.s.t - 1e-9) { reset(); }
  for (const c of log) {
    if (c.t < sim.s.t - 1e-9 || c.done === sim) continue;
    if (c.t > tt + 1e-9) break;
    to(c.t); apply(c); c.done = sim;
  }
  to(tt);
}
function to(tt) {                                      // step, sampling the recorder history every 1/30 s
  while (next <= tt + 1e-9) { if (next > sim.s.t) sim.step(next - sim.s.t); hist.push(sample(sim.read())); next += HIST; }
  if (tt > sim.s.t) sim.step(tt - sim.s.t);
  if (hist.length > 400) hist.splice(0, hist.length - 400);
}
const sample = (r) => ({ t: r.t, kv: r.on ? r.kv : 0, ma: r.ma, heat: r.heat });
function cmd(k, p, v) { log.push({ t: now(), k, p, v }); log.sort((a, b) => a.t - b.t); advance(now()); }
function setParam(k, v) { if (P[k] === v) return; P[k] = v; cmd('set', k, v); }
const expose = () => cmd('expose'), stop = () => cmd('release');
reset();
if (DEMO) log.push(...DEMO.sim.map((c) => ({ ...c })));  // the demo's whole timeline, known in advance
else log.push({ t: 0.6, k: 'expose' });               // the page opens on an exposure

function state(tt) {
  advance(tt);
  const S = sim.read();
  S.beam = S.on ? smooth(0, 0.06, S.expT) : S.t1 > 0 ? 1 - smooth(S.t1, S.t1 + FADE, tt) : 0;
  S.grow = 1 - Math.exp(-S.expT / 0.7);
  S.trackHeat = Math.min(1, Math.max(0, (S.trackT - 600) / 2200));
  S.filament = (S.filK / 2700) ** 6;
  S.history = hist;
  S.events = sim.events;
  return S;
}
const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

// ── controls ────────────────────────────────────────────────────────────────
const ui = { view: 'cutaway', slow: false, sound: false, orbit: { az: 0, el: 0, zoom: 1 } };
let clock;
const now = () => clock?.t ?? 0;
// a view switch is a timed move (pure in film time): camera blend, cut, ghosts, explode, callouts all derive from
// (prev, view, t0); the exploded view waits for the rotor to stop (a running exposure is released first)
const vs = { prev: 'cutaway', t0: -10, eLeave: 0, e: 0, cut: null, xt0: 0 };
function setView(name) {
  name = VIEWS[name] ? name : 'cutaway';
  if (name === ui.view && vs.t0 > -10) return;
  vs.prev = ui.view; vs.t0 = now(); vs.eLeave = vs.e;
  ui.view = name;
  if (name === 'exploded') { vs.xt0 = vs.t0; if (busy()) stop(); }
  if (name === 'image') {                              // the console's chest program (PA, SID 180 cm)
    if (busy()) stop();
    for (const k of ['kv', 'ma', 'ms']) setParam(k, CHEST[k]);
    setFocus('auto');
  }
  document.querySelectorAll('.views button').forEach((b) => b.classList.toggle('on', b.dataset.view === ui.view));
}
function busy() { const r = sim.read(); return r.on || r.waiting || r.phase === 'prep' || r.phase === 'ready'; }
function applyCut(on) {
  if (vs.cut === on) return; vs.cut = on;
  setCut(M, CUT, on); hideRemoved(tube.root, CUT, on, ['rotor', 'focusing cup']);
}
function viewPose(A, B, u) {
  const mix = (k) => A[k] + (B[k] - A[k]) * u;
  // zoom blends in log (the Image view pulls back ×6)
  const zoom = A.zoom * (B.zoom / A.zoom) ** u, zu = (Math.log(A.zoom) === Math.log(B.zoom)) ? u : Math.log(zoom / A.zoom) / Math.log(B.zoom / A.zoom);
  // the target offset blends on screen (offset × zoom), so the tube glides up-left instead of leaving the frame
  return { az: mix('az'), el: mix('el'), zoom, ty: (A.ty * A.zoom + (B.ty * B.zoom - A.ty * A.zoom) * zu) / zoom, cx: A.cx + (B.cx - A.cx) * zu, cy: A.cy + (B.cy - A.cy) * zu };
}
function viewState(tt, S) {
  const img = ui.view === 'image' || vs.prev === 'image';
  const u = smooth(vs.t0, vs.t0 + (img ? 1.6 : 1.1), tt), A = VIEWS[vs.prev], B = VIEWS[ui.view];
  const pose = viewPose(A, B, u);
  let e = 0;
  if (ui.view === 'exploded') {
    const stop = S.rpm > 0 ? null : (S.events.findLast((x) => x.type === 'stop')?.t ?? 0);
    vs.from = stop == null ? Infinity : Math.max(vs.t0 + 0.3, stop);   // the view line waits for it too
    e = Math.min(1, Math.max(0, (tt - vs.from) / 1.9));
  } else if (vs.eLeave > 0) e = vs.eLeave * (1 - smooth(vs.t0, vs.t0 + 1.0, tt));
  vs.e = e;
  // leaving Exploded: the camera starts its move only as the parts come home (no crop while they are still out)
  if (vs.prev === 'exploded' && ui.view !== 'exploded' && vs.eLeave > 0) {
    const w = Math.min(u, 1 - explode.lead(e));
    Object.assign(pose, viewPose(A, B, w));
  }
  const ghostA = ui.view === 'beam' ? smooth(vs.t0, vs.t0 + 0.6, tt) : vs.prev === 'beam' ? 1 - smooth(vs.t0, vs.t0 + 0.35, tt) : 0;
  const callA = (ui.view === 'cutaway' || ui.view === 'beam') ? smooth(vs.t0 + 0.7, vs.t0 + 1.2, tt) : 0;
  // the film is slapped onto the lightbox once the camera has pulled back: in fast (0.26 s, ease-out), no drift
  const ip = (tt - (vs.t0 + 1.15)) / 0.26, imgA = ui.view === 'image' ? (ip <= 0 ? 0 : ip >= 1 ? 1 : 1 - (1 - ip) ** 3) : 0;
  return { pose, e, ghostA, callA, labelA: smooth(0.82, 1, e), set: ui.view === 'image' || (vs.prev === 'image' && u < 1), imgA,
    imgCall: ui.view === 'image' ? smooth(vs.t0 + 1.4, vs.t0 + 2.0, tt) : 0 };
}
const toggle = (k, on = !ui[k]) => { ui[k] = on; document.querySelector(`[data-act="${k}"]`).classList.toggle('on', on); };
const resetOrbit = () => { ui.orbit = { az: 0, el: 0, zoom: 1 }; };
setView(DEMO ? DEMO.initial.view : Q.get('view') || 'cutaway');
vs.prev = ui.view; vs.t0 = DEMO ? DEMO.initial.t0 ?? -10 : -10;   // the page opens on its view, no move, no view line

// exposure readout: ms below 1 s, seconds from 1 s (10 000 ms would wrap the 46 px cell)
const msText = (ms) => (ms < 1000 ? num(ms) : `${num(ms / 1000, ms % 1000 ? 1 : 0)} s`);
const SL = {
  kv: bindSlider(document.querySelector('[data-key="kv"]'), { min: 40, max: 150, snap: Math.round, get: () => P.kv, set: (v) => setParam('kv', v) }),
  ma: bindSlider(document.querySelector('[data-key="ma"]'), { min: 10, max: 1000, log: true, snap: sig2, get: () => P.ma, set: (v) => setParam('ma', v) }),
  ms: bindSlider(document.querySelector('[data-key="ms"]'), { min: 1, max: 10000, log: true, snap: sig2, get: () => P.ms, set: (v) => setParam('ms', v) }),
};
const knob = document.querySelector('[data-act="expose"]');
const FOCI = ['auto', 'large', 'small'];
function setFocus(f) { setParam('focus', f); document.querySelectorAll('[data-focus]').forEach((b) => b.classList.toggle('on', b.dataset.focus === f)); }
document.querySelectorAll('[data-focus]').forEach((b) => (b.onclick = () => setFocus(b.dataset.focus)));

const pressKnob = () => { if (busy()) return stop(); if (ui.view === 'exploded') setView('cutaway'); expose(); };
knob.onclick = pressKnob;
knob.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pressKnob(); } };
document.querySelectorAll('.views button').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
document.querySelector('[data-act="slow"]').onclick = () => toggle('slow');
document.querySelector('[data-act="sound"]').onclick = () => toggle('sound');      // audio.js arrives in S5
document.querySelector('[data-act="reset"]').onclick = resetOrbit;
document.querySelector('[data-act="theme"]').onclick = () => toggleTheme();
document.querySelector('[data-act="lang"]').onclick = () => toggleLang();
// keys: Space = expose / release, 1–5 = views, S = slow motion, F = next focus
const KEYVIEW = ['housing', 'cutaway', 'beam', 'exploded', 'image'];
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('[role="slider"]')) return;
  if (e.key === ' ' && !e.target.closest?.('button, .knob')) { e.preventDefault(); pressKnob(); }
  else if (KEYVIEW[+e.key - 1]) setView(KEYVIEW[+e.key - 1]);
  else if (e.key === 's' || e.key === 'S') toggle('slow');
  else if (e.key === 'f' || e.key === 'F') setFocus(FOCI[(FOCI.indexOf(P.focus) + 1) % FOCI.length]);
});
bindOrbit(document.getElementById('stage'), {
  drag: (dx, dy) => { const o = ui.orbit; o.az += dx * 0.3; o.el = Math.min(30, Math.max(-12, o.el + dy * 0.2)); },
  wheel: (dy) => { const o = ui.orbit; o.zoom = Math.min(1.8, Math.max(0.7, o.zoom * Math.exp(-dy * 0.001))); },
});
// the same actions for the scripted demo (demo.js, S5)
window.__plate = { set: (k, v) => (k === 'focus' ? setFocus(v) : setParam(k, v)), expose, stop, view: setView, focus: setFocus,
  slow: (on) => toggle('slow', on), sound: (on) => toggle('sound', on), orbit: (o) => Object.assign(ui.orbit, o), reset: resetOrbit, P, ui,
  get sim() { return sim; }, debug: { tube, hero, ghost, explode, vs, setup, xr } };

// ── layout ──────────────────────────────────────────────────────────────────
const stage = document.getElementById('stage');
const L = createLayout({ plates: [...document.querySelectorAll('.plate')], renderer, onChange: () => clock?.film && clock.redraw() });
const demo = DEMO && createDemo(DEMO, { L, lang: Q.get('lang') || 'en',
  // the film is hidden until it lands: the camera aims at where it will be
  rectOf: { '#film': (plateRect) => { const st = plateRect('#stage'), b = filmBox(); return { x: st.x + b.x, y: st.y + b.y, w: b.w, h: b.h }; } } });
onLang(() => L.apply());
document.fonts.ready.then(() => { L.apply(); tube.housing.getObjectByName('nameplate').userData.redraw(); });

const card = document.getElementById('card');
function drawUI(S) {
  SL.kv.draw(P.kv, num(P.kv)); SL.ma.draw(P.ma, num(P.ma)); SL.ms.draw(P.ms, msText(P.ms));
  const pre = S.waiting || S.phase === 'prep' || S.phase === 'ready';
  document.querySelector('.knob-cap i').style.transform = `rotate(${S.on ? 58 : pre ? 29 : 0}deg)`;
  knob.setAttribute('aria-pressed', S.on || pre);
  // operating point: live values while the beam is on, set values otherwise
  const ma = S.on ? S.ma : S.maSet, kw = S.kv * ma / 1000;
  const rows = [
    ['card.kv', `${S.kv} <em>kV</em>`], ['card.ma', `${num(ma)} <em>mA</em>`], ['card.ms', `${num(S.on ? S.expT * 1000 : S.ms)} <em>ms</em>`],
    ['card.kw', `${kw.toFixed(1)} <em>kW</em>`], ['card.xshare', `${(S.xshare * 100).toFixed(1)} <em>%</em>`],
    ['card.speed', `${S.beta.toFixed(2)} <em>c</em>`], ['card.rpm', `${num(S.rpm)} <em>rpm</em>`],
    ['card.heat', `${(S.Q / 1000).toFixed(0)} <em>kJ · ${(S.heat * 100).toFixed(0)} %</em>`], ['card.spot', `${S.spot.toFixed(1)} <em>mm</em>`],
    ['card.track', `${num(S.trackT)} <em>°C</em>`],
  ];
  const shot = ui.view === 'image';
  if (shot) {                                          // this exposure (set values: the film follows them, see film())
    const mas = S.maSet * S.ms / 1000, c = xr.contrast(S.kv);
    rows.splice(0, rows.length,
      ['card.kv', `${S.kv} <em>kVp</em>`], ['card.mas', `${num(mas, mas < 10 ? 1 : 0)} <em>mAs</em>`], ['card.spot', `${S.spot.toFixed(1)} <em>mm</em>`],
      ['card.dose', `${entranceDose(S.kv, mas, SETUP.sid - 0.24).toFixed(2)} <em>mGy</em>`], ['card.sid', `${SETUP.sid * 100} <em>cm</em>`],
      ['card.ribc', `${(c.rib * 100).toFixed(1)} <em>%</em>`], ['card.spinec', `${(c.spine * 100).toFixed(0)} <em>%</em>`],
      ['card.rpm', `${num(S.rpm)} <em>rpm</em>`], ['card.heat', `${(S.Q / 1000).toFixed(0)} <em>kJ · ${(S.heat * 100).toFixed(0)} %</em>`]);
  }
  document.getElementById('card-sub').textContent = t(shot ? 'card.sub.image' : 'card.sub');
  card.innerHTML = rows.map(([k, v]) => `<dt>${t(k)}</dt><dd>${v}</dd>`).join('');
  document.getElementById('spec-sub').textContent = `${S.kv} kV · ${num(ma)} mA`;
  narr.textContent = narration(S);
  document.getElementById('focus-val').textContent = `${S.spot.toFixed(1)}`;
}
const narr = document.getElementById('narr');
function narration(S) {
  const lock = S.events.findLast((e) => e.type === 'interlock');
  const fill = (k, o) => Object.entries(o).reduce((x, [a, v]) => x.replaceAll(`{${a}}`, v), t(k));
  if (lock && !S.on && S.t - lock.t < 4 && lock.reason !== 'heat') return fill(`narr.lock.${lock.reason}`, { kw: (S.kv * S.maSet / 1000).toFixed(0), ms: num(S.ms), ma: num(S.maSet), kv: S.kv });
  if (lock && !S.on && S.t - lock.t < 4) return t('narr.lock.heat');
  if (ui.view === 'image') {
    const f = filmState(S);
    if (!f.ev) return S.on || S.waiting || S.phase === 'prep' || S.phase === 'ready' ? t('narr.prep') : fill('narr.image.ready', { kv: P.kv, mas: num(P.ma * P.ms / 1000) });
    const kvAt = log.findLast((c) => c.k === 'set' && c.p === 'kv' && c.t > f.ev.t && c.t <= S.t);
    if (kvAt && S.t - kvAt.t < 6) return t('narr.useshot2');
    if (S.t - f.ev.t < 7) return t('narr.useshot');
  }
  const since = S.t - (ui.view === 'exploded' ? vs.from : vs.t0);
  if (ui.view === 'exploded' && vs.e === 0 && S.rpm > 0) return t('narr.wait.exploded');
  if (since >= 0 && since < 4.5 && !(S.on && S.expT < 0.4)) return t(`narr.view.${ui.view}`);
  if (S.on) {
    const kOn = S.events.findLast((e) => e.type === 'k-lines-on');
    if (kOn && S.t - kOn.t < 3.5) return t('narr.klines');
    if (S.kw > 60) return t('narr.full');
    const beat = ['expose', 'brems', 'heat', 'spin'][Math.floor(S.expT / 3) % 4];
    return beat === 'expose' ? fill('narr.expose', { half: num(S.kv / 2, S.kv % 2 ? 1 : 0), beta: S.beta.toFixed(2) }) : t(`narr.${beat}`);
  }
  if (S.phase === 'ready') return t('narr.filament');
  if (S.waiting || S.phase === 'prep') return t('narr.prep');
  if (S.phase === 'brake') return t('narr.brake');
  if (S.heat > 0.4) return t('narr.cool');
  return t('narr.idle');
}

// ── one frame ───────────────────────────────────────────────────────────────
function frame(tt, dt) {
  if (DEMO) demo.camera(tt);                                 // the film camera first: every renderer reads its scale
  const S = state(tt);
  if (DEMO) demoView(tt, S);
  const V = viewState(tt, S);
  applyCut(ui.view !== 'housing' && ui.view !== 'image' && V.e <= 0.001);
  setup.root.visible = V.set; fx.setLong(V.set, { sid: SETUP.sid, fu: SETUP.field.u, fv: SETUP.field.v });
  for (const f of feet) f.visible = !V.set;
  stage.classList.toggle('img', ui.view === 'image');
  elementEl.style.opacity = ui.view === 'image' ? 1 - smooth(vs.t0 + 0.4, vs.t0 + 0.9, tt) : 1;   // the W cell makes room for the film
  hero.shadow.visible = hero.contact.visible = !V.set;
  hero.setView(V.pose);
  ghost.set(V.ghostA, { color: theme()['ink'] || '#D8E6EE', planes: vs.cut ? CUT : null });
  // motion: rotor (display rate, see Known simplifications); camera drift in the film, a slow sway live
  tube.rotor.rotation.x = S.rev * (1.4 * 60 / 9700) * Math.PI * 2;
  spinBlur.set(S.rpm);                                       // …but blurred by the true speed
  for (const c of tube.cages) c.rotation.x = tube.rotor.rotation.x * 0.42;          // ball cage ≈ 0.42 × rotor
  tube.filMat.emissiveIntensity = 2.2 * S.filament;
  // standby (≈ 2 060 K) → dark, boosted (≥ 2 350 K) → full; only where the cup is in sight through the cut / ghost
  const glow = smooth(2100, 2350, S.filK);
  cupGlow.material.opacity = 0.95 * glow; cupGlow.visible = glow > 0.01 && (ui.view === 'cutaway' || ui.view === 'beam') && V.e < 0.01;
  SHARED.uHeat.value = S.trackHeat; SHARED.uSpin.value = 2.2;
  fx.update({ beam: S.beam, t: tt, light: theme().name === 'light', open: ui.view !== 'housing' });
  const o = ui.orbit, drift = driftAt(tt);
  const extra = { az: drift.az + o.az, el: o.el, zoom: drift.zoom * o.zoom };
  hero.setExtra(extra);

  const vh = window.innerHeight, s = L.scale;
  renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
  const sr = stage.getBoundingClientRect();
  const rect = { x: sr.left, y: sr.top, w: sr.width, h: sr.height };
  const ppm = 1500 * s * (L.phone ? 0.86 * stage.offsetWidth / 758 : 1);  // phone: the desktop framing, a little looser, scaled to the column
  // (no imbalance tremble: sub-pixel at these sizes, it aliased into a jitter at 30 / 60 fps; the speed is heard)
  let centre = { x: sr.left + sr.width * V.pose.cx, y: sr.top + sr.height * (V.pose.cy - (L.phone ? 0.03 : 0)) };
  if (V.e > 0) {
    // exploded: de-overlap at a reference camera (the exploded pose, the drift as the view was entered, the orbit),
    // solved again only when that changes, so no part jumps while the film camera drifts; then pull back / re-centre
    // until the whole set fits the stage
    const X = VIEWS.exploded, d0 = clock?.film && !DEMO ? driftAt(vs.xt0 + 1.1).az : 0, pw = stage.offsetWidth, ph = stage.offsetHeight;
    const key = [d0, o.az, o.el, o.zoom, pw, ph, s, L.phone].join();
    if (key !== vs.xkey) {
      vs.xkey = key;
      const c0 = { x: sr.left + sr.width * X.cx, y: sr.top + sr.height * (X.cy - (L.phone ? 0.03 : 0)) };
      hero.setView(X); hero.setExtra({ az: d0 + o.az, el: o.el, zoom: o.zoom });
      hero.aim(rect, c0, ppm);
      explode.solve((p) => { const q = hero.project(p, rect); return [(q.x - sr.left) / s, (q.y - sr.top) / s]; });
      vs.xfit = explode.fit([(c0.x - sr.left) / s, (c0.y - sr.top) / s], [pw * 0.1, ph * 0.04, pw * 0.9, ph * 0.94]);
      hero.setView(V.pose);
    }
    explode.apply(V.e);
    const f = vs.xfit, u = explode.lead(V.e);                   // the camera keeps up with the group furthest out
    hero.setExtra({ ...extra, zoom: extra.zoom * f.z ** u });
    centre = { x: centre.x + f.dx * s * u, y: centre.y + f.dy * s * u };
  } else explode.apply(0);
  if (sr.bottom > 0 && sr.top < vh) hero.render(rect, centre, ppm, vh);
  film(S, V, sr, s, vh, tt);
  callouts(V, rect, sr, s);
  explode.apply(0);                                          // the drawings show the assembled tube
  drawings.render(vh, s);
  inst.draw(S, theme(), s);
  drawUI(S);
  // type pinned to 3D points (plate px, relative to the stage)
  const k = ppm / (1500 * s);
  const pin = (sel, p, dx = 0, dy = 0) => { const q = hero.project(p, rect); const el = document.querySelector(sel); el.style.left = `${(q.x - sr.left) / s + dx * k}px`; el.style.top = `${(q.y - sr.top) / s + dy * k}px`; };
  const rd = V3(0, Math.sin(DIM.recAngle), -Math.cos(DIM.recAngle));
  pin('.hv-a', V3(DIM.recX.anode, 0, 0).addScaledVector(rd, 0.17), 34, 0);
  pin('.hv-c', V3(DIM.recX.cathode, 0, 0).addScaledVector(rd, 0.17), -62, 0);
  pin('.beamtag', V3(0, DIM.floor, 0.05), -40, 14);
  const plain = (1 - smooth(0, 0.15, V.e)) * (V.set ? 0 : 1);
  for (const sel of ['.hv-a', '.hv-c', '.beamtag']) document.querySelector(sel).style.opacity = plain;
  if (DEMO) demo.overlays(tt);
}
// camera drift: the 5 s clip turned slowly; the demo (and live) sways ±3° so long films do not wander off
const driftAt = (t) => (clock?.film && !DEMO ? { az: -2 + t * 0.8, zoom: 1 + t * 0.006 } : { az: 3 * Math.sin(t * 0.15), zoom: 1 });

// the demo's view schedule and set values at t (pure: seeking replays them); setView's side effects (chest program,
// stopping an exposure) are commands in demo.json
function demoView(tt, S) {
  const v = viewAt(DEMO, tt);
  if (v.view === 'exploded') vs.xt0 = v.t0; else if (v.prev === 'exploded') vs.xt0 = v.prevT0;
  let eLeave = 0;
  if (v.prev === 'exploded') {
    const stopT = S.events.findLast((x) => x.type === 'stop' && x.t <= v.t0)?.t ?? 0;
    eLeave = Math.min(1, Math.max(0, (v.t0 - Math.max(v.prevT0 + 0.3, stopT)) / 1.9));
  }
  if (ui.view !== v.view) document.querySelectorAll('.views button').forEach((b) => b.classList.toggle('on', b.dataset.view === v.view));
  Object.assign(ui, { view: v.view }); Object.assign(vs, { prev: v.prev, t0: v.t0, eLeave });
  Object.assign(P, setAt(DEMO.sim, tt, DEF));
}

// ── the film (Image view): slides in after the camera pulls back; an exposure lights the lightbox and develops it.
// Once developed it follows the set kV / mAs live (as a re-exposure would), so turning kV shows the contrast change.
function filmState(S) {
  const ev = S.events.findLast((e) => e.type === 'expose-end' && e.t >= vs.t0 && e.t <= S.t);
  return { ev, exposing: S.on && S.t0 >= vs.t0 };
}
const elementEl = document.querySelector('.element');
const filmEl = document.getElementById('film'), linkEl = document.getElementById('link'), capEl = document.getElementById('film-cap');
/** the film's box on the stage (plate px, stage-relative) once it has landed */
function filmBox() {
  const W = stage.offsetWidth, H = stage.offsetHeight;
  let fh = H * 0.80, fw = fh * SETUP.field.u / SETUP.field.v;
  if (fw > W * 0.52) { fw = W * 0.52; fh = fw * SETUP.field.v / SETUP.field.u; }
  return { x: W * 0.43 + (W * 0.52 - fw) / 2, y: H * 0.045, w: fw, h: fh };
}
// a fluorescent lightbox: on, a dip as the tube strikes, on again
const flick = (u) => (u < 0 ? 0 : u < 0.05 ? 1 : u < 0.09 ? 0.35 : u < 0.13 ? 0.9 : 1);
function film(S, V, sr, s, vh, tt) {
  if (V.imgA <= 0) { filmEl.style.display = 'none'; linkEl.innerHTML = ''; return; }
  const W = stage.offsetWidth, fb = filmBox(), fw = fb.w, fh = fb.h;
  const fx0 = fb.x + (1 - V.imgA) * W * 0.18, fy0 = fb.y;
  const f = filmState(S);
  const light = f.ev ? flick(tt - f.ev.t) : 0, dev = f.ev ? smooth(f.ev.t + 0.15, f.ev.t + 1.65, tt) : 0;
  xr.render({ x: sr.left + fx0 * s, y: sr.top + fy0 * s, w: fw * s, h: fh * s }, vh,
    { kv: S.kv, mas: S.maSet * S.ms / 1000, dev, light, seed: f.ev ? (f.ev.t * 7.31) % 1 : 0, a: V.imgA });
  Object.assign(filmEl.style, { display: 'block', left: `${fx0}px`, top: `${fy0}px`, width: `${fw}px`, height: `${fh}px`, opacity: V.imgA });
  filmEl.classList.toggle('lit', light > 0.5);
  filmEl.querySelector('.f-wait').style.opacity = f.ev ? 0 : 0.5;
  filmEl.querySelector('.f-scale i').style.height = `${fh * 0.10 / SETUP.field.v}px`;
  capEl.textContent = f.ev ? `${S.kv} kVp · ${num(S.maSet * S.ms / 1000, 1)} mAs · ${S.spot.toFixed(1)} mm · SID ${SETUP.sid * 100} cm` : '';
  capEl.style.opacity = light;
  // red dashed link: detector edge → the film
  const q = hero.project(V3(0, SETUP.det - 0.01, 0.21), { x: sr.left, y: sr.top, w: sr.width, h: sr.height });
  const a = [(q.x - sr.left) / s, (q.y - sr.top) / s], b = [fx0 - 2, fy0 + fh * 0.62];
  const mx = (a[0] + b[0]) / 2;
  linkEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  // SID dimension beside the beam: focal spot → detector surface, drawn like the plate's other dimensions
  const st = (p) => { const r = hero.project(p, { x: sr.left, y: sr.top, w: sr.width, h: sr.height }); return [(r.x - sr.left) / s, (r.y - sr.top) / s]; };
  const d0 = st(DIM.spot), d1 = st(V3(DIM.spot.x, SETUP.det, DIM.spot.z)), dx = Math.max(d0[0], d1[0]) + 75;
  linkEl.innerHTML = `<g opacity="${V.imgA}"><path d="M${a[0]},${a[1]} L${mx},${a[1]} L${mx},${b[1]} L${b[0]},${b[1]}"/><circle cx="${a[0]}" cy="${a[1]}" r="2.4"/></g>`
    + `<g class="sid" opacity="${V.imgA}"><path d="M${d0[0] + 6},${d0[1]} H${dx + 5} M${d1[0] + 6},${d1[1]} H${dx + 5} M${dx},${d0[1]} V${d1[1]}"/>`
    + `<path d="M${dx - 3},${d0[1] + 7} L${dx},${d0[1]} L${dx + 3},${d0[1] + 7} M${dx - 3},${d1[1] - 7} L${dx},${d1[1]} L${dx + 3},${d1[1] - 7}"/>`
    + `<text x="${dx + 5}" y="${(d0[1] + d1[1]) / 2}" transform="rotate(-90 ${dx + 5} ${(d0[1] + d1[1]) / 2})" text-anchor="middle" dy="-2">SID ${SETUP.sid * 1000}</text></g>`;
}

// callouts in stage plate px: balloons + legend (Cutaway / Beam), side labels (Exploded, once apart)
const CO = createCallouts({ svg: document.getElementById('leaders'), layer: document.getElementById('callouts'), legend: document.getElementById('legend') });
function callouts(V, rect, sr, s) {
  const w = stage.offsetWidth, h = stage.offsetHeight;
  const at = (p) => { const q = hero.project(p, rect); return [(q.x - sr.left) / s, (q.y - sr.top) / s]; };
  if (!(w > 0 && h > 0 && Number.isFinite(at(V3(0, 0, 0))[0]))) return CO.hide();
  if (V.imgCall > 0) {
    CO.balloons(IMG_BALLOONS.map((b) => ({ ...b, text: t(b.key), at: at(b.at) })), { w, h, a: V.imgCall });
  } else if (V.labelA > 0) {
    CO.labels(explode.groups.filter((g) => !g.nolabel && !g.hide).map((g) => ({ id: g.key, text: t(g.key), at: at(explode.anchor(g)) })), { w, h, a: V.labelA });
  } else if (V.callA > 0) {
    CO.balloons(BALLOONS.map((b) => ({ ...b, text: t(b.key), at: at(b.at) })), { w, h, a: V.callA });
  } else CO.hide();
}

let rate = 1;                                              // slow motion eases to 1/25 and back over ≈ 0.4 s (live only)
clock = createClock(frame, { isLoaded: () => document.fonts.status === 'loaded', rate: () => (rate += ((ui.slow ? 0.04 : 1) - rate) * 0.12) });
await document.fonts.ready;
clock.start();
