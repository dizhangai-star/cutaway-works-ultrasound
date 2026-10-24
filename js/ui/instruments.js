// Canvas 2D instruments, drawn in plate px (1440 × 900 space) and scaled to the screen; colours from theme tokens,
// text from i18n. Generic helpers at the top (panel canvas, axes, dial); the four instruments below are subject-specific.

import { t, num } from '../i18n.js';
import { spectrum, K_EDGE, ratingKW, maxMA, FOCUS, ANODE, anodeLoss } from '../sim.js';

const F = { mono: (s, w = 400) => `${w} ${s}px "IBM Plex Mono", monospace`, cond: (s, w = 600) => `${w} ${s}px "Barlow Condensed", "Noto Sans SC", sans-serif` };

function prep(cv, scale) {
  const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2) * scale;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  return { c, w, h };
}
function alpha(css, a) {
  if (css.startsWith('#')) { const n = parseInt(css.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
  return css.replace(/[\d.]+\)$/, `${a})`);
}
function gridBox(c, x, y, w, h, tk, nx, ny) {
  c.strokeStyle = tk.grid; c.lineWidth = 1;
  for (let i = 0; i <= nx * 2; i++) { const X = Math.round(x + w * i / (nx * 2)) + 0.5; c.globalAlpha = i % 2 ? 0.6 : 1; c.beginPath(); c.moveTo(X, y); c.lineTo(X, y + h); c.stroke(); }
  for (let j = 0; j <= ny * 2; j++) { const Y = Math.round(y + h * j / (ny * 2)) + 0.5; c.globalAlpha = j % 2 ? 0.6 : 1; c.beginPath(); c.moveTo(x, Y); c.lineTo(x + w, Y); c.stroke(); }
  c.globalAlpha = 1;
  c.strokeStyle = tk['rule-soft']; c.strokeRect(x + 0.5, y + 0.5, w, h);
}
function text(c, s, x, y, font, color, align = 'left', base = 'alphabetic') { c.font = font; c.fillStyle = color; c.textAlign = align; c.textBaseline = base; c.fillText(s, x, y); }

/** analogue dial: 240° sweep, major/minor ticks, red band, needle, mono readout below */
function dial(c, cx, cy, R, { min, max, major, minor, red, value, unit, tk, labels }) {
  const a0 = Math.PI * (0.5 + 1 / 6 + 0.5), sweep = Math.PI * 4 / 3;   // from 210° to -30° (canvas: clockwise)
  const ang = (v) => Math.PI * 5 / 6 + sweep * (v - min) / (max - min);
  // face
  const g = c.createRadialGradient(cx, cy - R * 0.3, R * 0.1, cx, cy, R * 1.1);
  g.addColorStop(0, alpha(tk.ink, 0.07)); g.addColorStop(1, alpha(tk.ink, 0.0));
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R + 6, 0, Math.PI * 2); c.fill();
  c.strokeStyle = tk['rule-soft']; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, R + 6, 0, Math.PI * 2); c.stroke();
  if (red) { c.strokeStyle = tk.accent; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R - 1.5, ang(red[0]), ang(red[1])); c.stroke(); }
  c.strokeStyle = tk.ink; c.lineWidth = 1;
  for (let v = min; v <= max + 1e-6; v += minor) {
    const a = ang(v), big = Math.abs(v / major - Math.round(v / major)) < 1e-6, r0 = R - (big ? 8 : 4);
    c.lineWidth = big ? 1.4 : 0.8;
    c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.stroke();
    if (big && labels && (v === min || Math.abs(v - max) < 1e-6)) text(c, String(v), cx + Math.cos(a) * (R + 10), cy + Math.sin(a) * (R + 10) + 3, F.mono(8), tk['ink-2'], 'center');
  }
  text(c, unit, cx, cy + R * 0.62, F.cond(14, 700), tk.ink, 'center');
  const a = ang(Math.max(min, Math.min(max, value)));
  c.strokeStyle = tk.accent; c.lineWidth = 2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx - Math.cos(a) * 6, cy - Math.sin(a) * 6); c.lineTo(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3)); c.stroke();
  c.lineCap = 'butt';
  c.fillStyle = tk.ink; c.beginPath(); c.arc(cx, cy, 3, 0, Math.PI * 2); c.fill();
  void a0;
}

export function createInstruments(root) {
  const cv = {}; root.querySelectorAll('canvas.inst').forEach((el) => (cv[el.dataset.inst] = el));
  let specCache = { kv: -1 };

  function params(S, tk, sc) {
    const { c, w, h } = prep(cv.params, sc);
    const R = 33;
    for (const [i, d] of [[0, { min: 0, max: 150, major: 50, minor: 10, value: S.kv, unit: 'kV', red: null }], [1, { min: 0, max: 1000, major: 250, minor: 50, value: S.ma, unit: 'mA', red: [400, 1000] }]]) {
      const x0 = 8 + i * (w - 16) / 2, cw = (w - 16) / 2;
      c.strokeStyle = tk['rule-soft']; c.strokeRect(x0 + 2.5, 4.5, cw - 5, h - 9);
      dial(c, x0 + 46, h / 2 + 2, R, { ...d, tk, labels: true });
      // digital readout
      const bx = x0 + 88, bw = cw - 96, by = h / 2 - 24;
      c.strokeStyle = tk.rule; c.strokeRect(bx + 0.5, by + 0.5, bw, 30);
      text(c, num(d.value), bx + bw - 6, by + 23, F.mono(21, 500), tk.ink, 'right');
      const sub = i === 1 ? `⌀ ${S.spot.toFixed(1)} mm` : S.beam > 0.5 ? `● ${num(S.expT * 1000)} ms` : '○ 0 ms';
      text(c, sub, bx + bw, by + 46, F.mono(9.5), i === 0 && S.beam > 0.5 ? tk.accent : tk['ink-2'], 'right');
    }
  }

  function spec(S, tk, sc) {
    const { c, w, h } = prep(cv.spectrum, sc);
    if (specCache.kv !== S.kv) specCache = spectrum(S.kv);
    const sp = specCache;
    const x = 34, y = 10, gw = w - x - 10, gh = h - y - 32;
    gridBox(c, x, y, gw, gh, tk, 6, 2);
    const X = (e) => x + gw * e / 150, Y = (v) => y + gh * (1 - v);
    for (const e of [0, 25, 50, 75, 100, 125, 150]) text(c, String(e), X(e), y + gh + 11, F.mono(8.5), tk['ink-2'], 'center');
    for (const v of [0, 0.5, 1]) text(c, v.toFixed(1), x - 5, Y(v) + 3, F.mono(8.5), tk['ink-2'], 'right');
    text(c, t('inst.spectrum.axis'), x + gw / 2, h - 5, F.cond(10.5, 600), tk['ink-2'], 'center');
    c.save(); c.translate(9, y + gh / 2); c.rotate(-Math.PI / 2); text(c, t('inst.spectrum.yaxis'), 0, 0, F.cond(9.5, 600), tk['ink-2'], 'center', 'middle'); c.restore();
    // K edge
    c.setLineDash([3, 3]); c.strokeStyle = alpha(tk.accent, 0.7); c.beginPath(); c.moveTo(X(K_EDGE) + 0.5, y); c.lineTo(X(K_EDGE) + 0.5, y + gh); c.stroke(); c.setLineDash([]);
    text(c, t('inst.spectrum.kedge'), X(K_EDGE) + 3, y + gh - 4, F.mono(8), alpha(tk.accent, 0.85));
    // grows during the exposure
    const grow = S.grow;
    if (grow > 0.001) {
      const cont = sp.C, n = sp.E.length;
      let cpk = 0; for (let i = 0; i < n; i++) cpk = Math.max(cpk, cont[i]);
      const amp = 0.45 / (cpk || 1) * grow;
      const lv = (j) => Math.min(0.97 * grow, sp.I[j] * amp);
      c.beginPath(); c.moveTo(X(0), Y(0));
      for (let i = 0; i < n; i++) c.lineTo(X(sp.E[i]), Y(cont[i] * amp));
      c.lineTo(X(150), Y(0)); c.closePath();
      const fg = c.createLinearGradient(0, y, 0, y + gh); fg.addColorStop(0, alpha(tk.ink, 0.32)); fg.addColorStop(1, alpha(tk.ink, 0.04));
      c.fillStyle = fg; c.fill();
      c.beginPath(); for (let i = 0; i < n; i++) { const P = [X(sp.E[i]), Y(cont[i] * amp)]; i ? c.lineTo(...P) : c.moveTo(...P); }
      c.strokeStyle = tk.ink; c.lineWidth = 1.3; c.stroke();
      // K lines in red
      if (sp.kOn) {
        c.strokeStyle = tk.accent; c.lineWidth = 2;
        for (const e of [57.98, 59.32, 67.24, 69.07]) {
          const j = Math.round(e / 0.5), v = lv(j);
          c.beginPath(); c.moveTo(X(e), Y(cont[j] * amp)); c.lineTo(X(e), Y(v)); c.stroke();
        }
        const ja = Math.round(59.32 / 0.5), jb = Math.round(67.24 / 0.5);
        text(c, 'W Kα 59.3', X(59.32) - 4, Y(lv(ja)) + 8, F.mono(8.5, 500), tk.accent, 'right');
        text(c, 'W Kβ 67.2', X(67.24) + 4, Y(lv(jb)) + 8, F.mono(8.5, 500), tk.accent, 'left');
      }
      // endpoint = kVp, mean energy dot
      c.fillStyle = tk.ink; c.beginPath(); c.moveTo(X(S.kv), Y(0) - 1); c.lineTo(X(S.kv) - 4, Y(0) - 8); c.lineTo(X(S.kv) + 4, Y(0) - 8); c.fill();
      text(c, `${S.kv} kVp`, X(S.kv), Y(0) - 11, F.mono(8.5, 500), tk.ink, 'center');
      const jm = Math.round(sp.mean / 0.5);
      c.fillStyle = tk.paper; c.strokeStyle = tk.ink; c.lineWidth = 1.2;
      c.beginPath(); c.arc(X(sp.mean), Y(cont[jm] * amp), 3.2, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    // legend
    const lx = x + gw - 112, ly = y + 12;
    c.strokeStyle = tk.ink; c.lineWidth = 1.3; c.beginPath(); c.moveTo(lx, ly - 3); c.lineTo(lx + 14, ly - 3); c.stroke();
    text(c, t('inst.spectrum.total'), lx + 18, ly, F.cond(9.5, 600), tk['ink-2']);
    c.strokeStyle = tk.accent; c.lineWidth = 2; c.beginPath(); c.moveTo(lx, ly + 10); c.lineTo(lx + 14, ly + 10); c.stroke();
    text(c, t('inst.spectrum.k'), lx + 18, ly + 13, F.cond(9.5, 600), tk['ink-2']);
  }

  function heat(S, tk, sc) {
    const { c, w, h } = prep(cv.heat, sc);
    const cx = 112, cy = h / 2 + 2, R = 60;                  // disc Ø 74 → R = 60 px (1.62 px/mm)
    const mm = R / 37;
    // crosshair
    c.setLineDash([6, 2, 1, 2]); c.strokeStyle = tk['rule-soft']; c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx - R - 14, cy); c.lineTo(cx + R + 14, cy); c.moveTo(cx, cy - R - 12); c.lineTo(cx, cy + R + 12); c.stroke(); c.setLineDash([]);
    // disc: brushed molybdenum
    const g = c.createRadialGradient(cx - 18, cy - 22, 4, cx, cy, R);
    g.addColorStop(0, '#d7d9da'); g.addColorStop(0.55, '#8f9396'); g.addColorStop(1, '#4b4f53');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
    c.globalAlpha = 0.18; c.strokeStyle = '#000';
    for (let r = 4; r < R; r += 2.2) { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); }
    c.restore(); c.globalAlpha = 1;
    // focal track 25.5–34.5 mm, heated at the spot (6 o'clock) and smeared round by rotation
    const r0 = 25.5 * mm, r1 = 34.5 * mm, rm = (r0 + r1) / 2;
    c.lineWidth = r1 - r0; c.strokeStyle = 'rgba(230,228,222,0.55)'; c.beginPath(); c.arc(cx, cy, rm, 0, Math.PI * 2); c.stroke();
    // colours on the bar's scale (200–2,600 °C): the track band at disc + ring temperature, the flash under the spot
    // smeared round by rotation while the beam is on
    const K = (T) => Math.min(1, Math.max(0, (T - 200) / 2400));
    const kRing = K(S.disc + S.ring), kSpot = K(S.trackT), hot = Math.max(kRing, kSpot);
    if (K(S.disc) > 0.15) { c.fillStyle = heatColor(K(S.disc)); c.globalAlpha = 0.35 * K(S.disc); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    if (hot > 0.01) {
      const segs = 180;
      for (let i = 0; i < segs; i++) {
        const behind = i / segs * Math.PI * 2;                // radians behind the spot along the rotation
        const k = S.on ? kRing + (kSpot - kRing) * Math.exp(-behind / 1.1) : kRing;
        const a = Math.PI / 2 - behind;                       // spot at the bottom, disc turning counter-clockwise on screen
        c.strokeStyle = heatColor(k); c.globalAlpha = Math.min(1, k * 1.4);
        c.beginPath(); c.arc(cx, cy, rm, a - 0.02, a + Math.PI * 2 / segs + 0.02); c.stroke();
      }
      c.globalAlpha = 1;
      const f = S.on ? kSpot : 0;
      const sg = c.createRadialGradient(cx, cy + rm, 0, cx, cy + rm, 16);
      sg.addColorStop(0, 'rgba(255,244,224,' + (0.95 * f) + ')'); sg.addColorStop(0.4, 'rgba(255,154,60,' + (0.6 * f) + ')'); sg.addColorStop(1, 'rgba(210,50,45,0)');
      c.fillStyle = sg; c.beginPath(); c.arc(cx, cy + rm, 16, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#2a2d30'; c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#a9adb0'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, 4, 0, Math.PI * 2); c.stroke();
    // rotation arrow + rpm
    c.strokeStyle = tk.ink; c.lineWidth = 1.2; c.beginPath(); c.arc(cx, cy, R + 8, Math.PI * 0.72, Math.PI * 0.98); c.stroke();
    const ea = Math.PI * 0.72; c.fillStyle = tk.ink; c.beginPath();
    c.moveTo(cx + Math.cos(ea) * (R + 8), cy + Math.sin(ea) * (R + 8)); c.lineTo(cx + Math.cos(ea + 0.09) * (R + 3), cy + Math.sin(ea + 0.09) * (R + 3)); c.lineTo(cx + Math.cos(ea + 0.09) * (R + 13), cy + Math.sin(ea + 0.09) * (R + 13)); c.fill();
    text(c, t('inst.heat.rot'), 8, h - 22, F.cond(10, 600), tk['ink-2']);
    text(c, `${num(S.rpm)} rpm`, 8, h - 8, F.mono(11, 500), tk.ink);
    text(c, 'Ø 74', cx + R * 0.72, cy - R * 0.78, F.mono(9), tk['ink-2'], 'left');
    // colour bar °C (modelled)
    const bx = w - 92, by = 16, bh = h - 40;
    const bar = c.createLinearGradient(0, by + bh, 0, by);
    bar.addColorStop(0, '#20303c'); bar.addColorStop(0.35, '#D2322D'); bar.addColorStop(0.7, '#FF9A3C'); bar.addColorStop(1, '#FFF4E0');
    c.fillStyle = bar; c.fillRect(bx, by, 9, bh); c.strokeStyle = tk['rule-soft']; c.strokeRect(bx + 0.5, by + 0.5, 9, bh);
    for (const [i, T] of [[0, 200], [1, 800], [2, 1400], [3, 2000], [4, 2600]]) {
      const yy = by + bh - bh * i / 4;
      c.strokeStyle = tk['ink-2']; c.beginPath(); c.moveTo(bx + 9, yy + 0.5); c.lineTo(bx + 13, yy + 0.5); c.stroke();
      text(c, num(T), bx + 16, yy + 3, F.mono(8.5), tk['ink-2']);
    }
    text(c, '°C', bx, by - 5, F.mono(8.5), tk['ink-2']);
    const ty = cy + rm;
    c.strokeStyle = tk.accent; c.lineWidth = 1; c.beginPath(); c.moveTo(cx + 16, ty + 2); c.lineTo(bx - 34, h - 20); c.lineTo(bx - 8, h - 20); c.stroke();
    text(c, t('inst.heat.track'), bx - 8, h - 8, F.cond(9.5, 600), tk.accent, 'right');
    text(c, `${num(S.trackT)} °C`, bx - 8, h - 30, F.mono(10, 500), tk.accent, 'right');
    // marker on the colour bar
    const my = by + bh - bh * K(S.trackT); c.fillStyle = tk.accent; c.beginPath(); c.moveTo(bx - 1, my); c.lineTo(bx - 6, my - 3.5); c.lineTo(bx - 6, my + 3.5); c.fill();
  }

  function recorder(S, tk, sc) {
    const { c, w, h } = prep(cv.recorder, sc);
    const x = 34, y = 8, gw = w - x - 96, gh = h - y - 24, span = 6;
    gridBox(c, x, y, gw, gh, tk, 6, 2);
    const t1 = Math.max(span, S.t), t0 = t1 - span;
    const X = (tt) => x + gw * (tt - t0) / span;
    for (let k = 0; k <= 6; k++) text(c, (t0 + k).toFixed(0), x + gw * k / 6, y + gh + 11, F.mono(8.5), tk['ink-2'], 'center');
    for (const [v, s] of [[0, '0'], [0.5, '50'], [1, '100']]) text(c, s, x - 5, y + gh * (1 - v) + 3, F.mono(8.5), tk['ink-2'], 'right');
    const pens = [['kv', 150, tk.ink, 1.4], ['ma', 1000, tk['ink-2'], 1.2], ['heat', 1, tk.accent, 1.8]];
    for (const [k, max, col, lw] of pens) {
      c.beginPath(); let first = true;
      for (const p of S.history) { if (p.t < t0) continue; const P = [X(p.t), y + gh * (1 - p[k] / max)]; first ? c.moveTo(...P) : c.lineTo(...P); first = false; }
      c.strokeStyle = col; c.lineWidth = lw; c.stroke();
    }
    // pen legend + live values
    const lx = x + gw + 10;
    const rows = [['kV', num(S.kv), tk.ink], ['mA', num(S.ma), tk['ink-2']], [t('inst.recorder.heat'), `${(S.heat * 100).toFixed(0)} %`, tk.accent]];
    rows.forEach(([n, v, col], i) => {
      const yy = y + 14 + i * 26;
      c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(lx, yy - 4); c.lineTo(lx + 10, yy - 4); c.stroke();
      text(c, n, lx + 14, yy, F.cond(11, 700), tk.ink);
      text(c, v, w - 6, yy, F.mono(10.5, 500), tk.ink, 'right');
    });
    text(c, t('inst.recorder.time'), x + gw / 2, h - 2, F.cond(9.5, 600), tk['ink-2'], 'center');
  }


  // datasheet rating (p 6): mA vs exposure time per kV for the focus in use; constant power per time, capped by the
  // focus's current limit. Red dot = the set operating point (red ring when the interlock would refuse it).
  function rating(S, tk, sc) {
    if (!cv.rating) return;
    const { c, w, h } = prep(cv.rating, sc);
    const x = 30, y = 6, gw = w - x - 8, gh = h - y - 16, top = FOCUS[S.focus].maxMA;
    gridBox(c, x, y, gw, gh, tk, 3, 2);
    const X = (sec) => x + gw * (Math.log10(sec) + 2) / 3, Y = (ma) => y + gh * (1 - ma / top);
    for (const [sec, l] of [[0.01, '0.01'], [0.1, '0.1'], [10, '10']]) text(c, l, X(sec), y + gh + 10, F.mono(8), tk['ink-2'], sec === 0.01 ? 'left' : sec === 10 ? 'right' : 'center');
    for (const v of [0, top / 2, top]) text(c, String(v), x - 4, Y(v) + 3, F.mono(8), tk['ink-2'], 'right');
    text(c, t('rating.x'), X(0.32), y + gh + 10, F.cond(8.5, 600), tk['ink-2'], 'center');
    const kvs = [70, 100, 150];
    for (const kv of kvs) {
      c.beginPath();
      for (let i = 0; i <= 90; i++) { const sec = 10 ** (-2 + 3 * i / 90), ma = Math.min(maxMA(kv, S.focus), ratingKW(sec, S.focus) * 1000 / kv); i ? c.lineTo(X(sec), Y(ma)) : c.moveTo(X(sec), Y(ma)); }
      const on = kv === 100;
      c.strokeStyle = on ? tk.ink : tk['ink-2']; c.lineWidth = on ? 1.3 : 0.9; c.stroke();
      const at = kv < 90 ? 0.6 : 0.0115, lab = Math.min(maxMA(kv, S.focus), ratingKW(at, S.focus) * 1000 / kv);
      text(c, `${kv} kV`, X(at), Y(lab) + (kv > 120 ? 9 : -3), F.mono(7.5), tk['ink-2'], 'left');
    }
    // the present kV, dashed, through the operating point
    c.setLineDash([3, 2]); c.beginPath();
    for (let i = 0; i <= 90; i++) { const sec = 10 ** (-2 + 3 * i / 90), ma = Math.min(maxMA(S.kv, S.focus), ratingKW(sec, S.focus) * 1000 / S.kv); i ? c.lineTo(X(sec), Y(ma)) : c.moveTo(X(sec), Y(ma)); }
    c.strokeStyle = alpha(tk.accent, 0.8); c.lineWidth = 1; c.stroke(); c.setLineDash([]);
    const px = X(Math.min(10, Math.max(0.01, S.ms / 1000))), py = Y(Math.min(top, S.maSet));
    c.fillStyle = S.lock ? tk.paper : tk.accent; c.strokeStyle = tk.accent; c.lineWidth = 1.5;
    c.beginPath(); c.arc(px, py, 3.5, 0, Math.PI * 2); c.fill(); c.stroke();
    text(c, `${t(S.focus === 'large' ? 'rating.large' : 'rating.small')} · ${S.kv} kV`, x + gw - 4, y + 11, F.cond(9, 700), tk.accent, 'right');
  }

  // anode heat content (p 10): datasheet cooling from full and heating at 475 W as dots, the fitted model as lines,
  // the solver's present heat as a red level with its place on the cooling curve
  const COOL = [[0, 210], [2, 165], [4, 130], [6, 100], [8, 80], [10, 65], [12, 54]], HEAT = [[2, 54], [5, 113], [12, 190]];
  const model = (() => {
    const cool = [], heat = []; let qc = ANODE.Q, qh = 0;
    for (let i = 0; i <= 12 * 60; i++) { if (i % 10 === 0) { cool.push([i / 60, qc / 1e3]); heat.push([i / 60, qh / 1e3]); } qc -= anodeLoss(qc); qh += 475 - anodeLoss(qh); }
    return { cool, heat };
  })();
  function cooling(S, tk, sc) {
    if (!cv.cooling) return;
    const { c, w, h } = prep(cv.cooling, sc);
    const x = 30, y = 5, gw = w - x - 8, gh = h - y - 13;
    gridBox(c, x, y, gw, gh, tk, 6, 2);
    const X = (m) => x + gw * m / 12, Y = (kj) => y + gh * (1 - kj / 210);
    for (const m of [0, 6, 12]) text(c, String(m), X(m), y + gh + 9, F.mono(8), tk['ink-2'], m ? m === 12 ? 'right' : 'center' : 'left');
    for (const v of [0, 210]) text(c, String(v), x - 4, Y(v) + 3, F.mono(8), tk['ink-2'], 'right');
    text(c, t('cooling.x'), X(9), y + gh + 9, F.cond(8.5, 600), tk['ink-2'], 'center');
    for (const [pts, col, lw] of [[model.cool, tk.ink, 1.3], [model.heat, tk['ink-2'], 1]]) {
      c.beginPath(); pts.forEach(([m, kj], i) => (i ? c.lineTo(X(m), Y(kj)) : c.moveTo(X(m), Y(kj)))); c.strokeStyle = col; c.lineWidth = lw; c.stroke();
    }
    c.fillStyle = tk.ink; for (const [m, kj] of COOL) { c.beginPath(); c.arc(X(m), Y(kj), 1.8, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = tk['ink-2']; c.lineWidth = 1; for (const [m, kj] of HEAT) { c.beginPath(); c.arc(X(m), Y(kj), 2, 0, Math.PI * 2); c.stroke(); }
    text(c, t('cooling.cool'), X(2.3), Y(165) - 2, F.cond(8.5, 600), tk.ink, 'left');
    text(c, t('cooling.heat'), X(11.8), Y(150) + 2, F.cond(8.5, 600), tk['ink-2'], 'right');
    // now: the level, and the place on the cooling curve (minutes to cool from full to here)
    const kj = S.Q / 1e3, at = model.cool.find(([, q]) => q <= kj)?.[0] ?? 12;
    c.setLineDash([3, 2]); c.strokeStyle = alpha(tk.accent, 0.7); c.beginPath(); c.moveTo(x, Y(kj) + 0.5); c.lineTo(X(at), Y(kj) + 0.5); c.stroke(); c.setLineDash([]);
    c.fillStyle = tk.accent; c.beginPath(); c.arc(X(at), Y(kj), 3.2, 0, Math.PI * 2); c.fill();
    text(c, `${t('cooling.now')} ${kj.toFixed(0)} kJ`, x + 4, Y(kj) + (kj > 150 ? 10 : -3), F.mono(8.5, 500), tk.accent, 'left');
  }

  return {
    draw(S, tk, scale) { params(S, tk, scale); spec(S, tk, scale); heat(S, tk, scale); recorder(S, tk, scale); rating(S, tk, scale); cooling(S, tk, scale); },
  };
}

function heatColor(k) {
  const s = Math.max(0, Math.min(1, k));
  const A = [210, 50, 45], B = [255, 154, 60], C = [255, 244, 224];
  const m = (p, q, u) => p.map((v, i) => Math.round(v + (q[i] - v) * u));
  const c = s < 0.5 ? m(A, B, s * 2) : m(B, C, (s - 0.5) * 2);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
