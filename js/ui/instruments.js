// Canvas 2D instruments, drawn in plate px (1440 × 900 space) and scaled to the screen; colours from theme tokens,
// text from i18n. Generic helpers at the top (panel canvas, axes); the instruments below are subject-specific.

import { t, num } from '../i18n.js';
import { PROBE, pulse, spectrum, band6, penetration, tgc, delays, roundTrip, TGCMAX } from '../sim.js';

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
function text(c, s, x, y, font, color, align = 'left', base = 'alphabetic') { c.font = font; c.fillStyle = color; c.textAlign = align; c.textBaseline = base; c.fillText(s, x, y); }
/** axes box with grid and tick labels; returns mappers X(v), Y(v) */
function axes(c, tk, { x, y, w, h, x0, x1, y0, y1, xt, yt, xl, yl, xf = (v) => num(v), yf = (v) => num(v) }) {
  c.strokeStyle = tk.grid; c.lineWidth = 1;
  const X = (v) => x + (v - x0) / (x1 - x0) * w, Y = (v) => y + h - (v - y0) / (y1 - y0) * h;
  for (const v of xt) { const px = Math.round(X(v)) + 0.5; c.beginPath(); c.moveTo(px, y); c.lineTo(px, y + h); c.stroke(); text(c, xf(v), px, y + h + 10, F.mono(8), tk['ink-2'], 'center'); }
  for (const v of yt) { const py = Math.round(Y(v)) + 0.5; c.beginPath(); c.moveTo(x, py); c.lineTo(x + w, py); c.stroke(); text(c, yf(v), x - 4, py + 3, F.mono(8), tk['ink-2'], 'right'); }
  c.strokeStyle = tk['rule-soft']; c.strokeRect(x + 0.5, y + 0.5, w, h);
  if (xl) text(c, xl, x + w / 2, y + h + 20, F.cond(9, 600), tk['ink-2'], 'center');
  if (yl) { c.save(); c.translate(x - 26, y + h / 2); c.rotate(-Math.PI / 2); text(c, yl, 0, 0, F.cond(9, 600), tk['ink-2'], 'center'); c.restore(); }
  return { X, Y };
}
function plot(c, xs, ys, X, Y, col, lw = 1.2, dash) {
  c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.beginPath();
  xs.forEach((v, i) => (i ? c.lineTo(X(v), Y(ys[i])) : c.moveTo(X(v), Y(ys[i])))); c.stroke(); c.setLineDash([]);
}

export function createInstruments(root) {
  const cv = {}; root.querySelectorAll('canvas.inst').forEach((el) => (cv[el.dataset.inst] = el));

  // ── 1. A-line: RF echo of the red line vs time; the stone's echo, then silence ──
  function aline(S, tk, sc) {
    const { c, w, h } = prep(cv.aline, sc), B = S.B;
    if (!B) return;
    const T = roundTrip(B.depth), tmax = Math.ceil(T / 20) * 20;
    const { X, Y } = axes(c, tk, { x: 34, y: 8, w: w - 44, h: h - 38, x0: 0, x1: tmax, y0: -1, y1: 1,
      xt: Array.from({ length: tmax / 20 + 1 }, (_, i) => i * 20), yt: [-1, 0, 1], xl: t('aline.x'), yl: '√amp', yf: (v) => v.toFixed(1) });
    const l = Math.round((S.stone.th + PROBE.fov / 2) / B.dth), row = B.rf.subarray(l * B.NS, (l + 1) * B.NS);
    let mx = 0; for (const v of row) mx = Math.max(mx, Math.abs(v));
    c.strokeStyle = tk.ink; c.lineWidth = 0.9; c.beginPath();
    const n = row.length, px = w - 44, step = n / (px * 2);
    for (let k = 0; k < px * 2; k++) {
      const i0 = Math.floor(k * step), i1 = Math.max(i0 + 1, Math.floor((k + 1) * step)); let lo = 1, hi = -1;
      for (let i = i0; i < i1 && i < n; i++) { const r = row[i] / mx, v = Math.sign(r) * Math.sqrt(Math.abs(r)); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const tt = (i0 * B.dz) * 2 / PROBE.c;
      c.moveTo(X(tt), Y(hi)); c.lineTo(X(tt), Y(lo));
    }
    c.stroke();
    const xs = X(S.stone.us);
    c.strokeStyle = tk.accent; c.setLineDash([3, 2]); c.beginPath(); c.moveTo(xs, 8); c.lineTo(xs, h - 30); c.stroke(); c.setLineDash([]);
    text(c, `${t('aline.stone')} ${num(S.stone.us, 0)} µs`, xs + 5, 18, F.cond(9.5, 700), tk.accent);
    text(c, t('aline.shadow'), X(Math.min(tmax * 0.8, S.stone.us + 50)), 32, F.cond(9, 600), tk['ink-2'], 'center');
  }

  // ── 2. pulse + spectrum: the transmit waveform; its spectrum against the 5–2 MHz band ──
  function pulseInst(S, tk, sc) {
    const { c, w, h } = prep(cv.pulse, sc), half = (w - 20) / 2;
    const P = pulse(S.f, 200, 3);
    text(c, t('pulse.tx'), 34, 14, F.cond(9.5, 600), tk['ink-2']);
    const A = axes(c, tk, { x: 34, y: 20, w: half - 40, h: h - 50, x0: 0, x1: 3, y0: -1.1, y1: 1.1, xt: [0, 1, 2, 3], yt: [], xl: t('pulse.x') });
    plot(c, P.t, P.v, A.X, A.Y, tk.ink, 1.2);
    const x2 = 34 + half + 6, w2 = w - x2 - 10;
    text(c, t('pulse.spec'), x2, 14, F.cond(9.5, 600), tk['ink-2']);
    const fx1 = S.f > 6 ? 12 : 8;                      // the 9 MHz comparison needs a wider axis
    const B2 = axes(c, tk, { x: x2, y: 20, w: w2, h: h - 50, x0: 0, x1: fx1, y0: 0, y1: 1.1, xt: fx1 > 8 ? [0, 3, 6, 9, 12] : [0, 2, 4, 6, 8], yt: [0, 0.5, 1], xl: t('pulse.fx'), yf: (v) => v.toFixed(1) });
    c.fillStyle = alpha(tk.ink, 0.1); c.fillRect(B2.X(PROBE.band[0]), 20, B2.X(PROBE.band[1]) - B2.X(PROBE.band[0]), h - 50);
    text(c, '5–2 MHz', B2.X(5) + 3, h - 36, F.mono(8, 500), tk.ink, 'left');
    const fs = Array.from({ length: 161 }, (_, i) => i * fx1 / 160);
    plot(c, fs, fs.map((f) => spectrum(f, S.f)), B2.X, B2.Y, tk.ink, 1.3);
    const [lo, hi] = band6(S.f);
    c.strokeStyle = tk.accent; c.setLineDash([2, 2]); c.beginPath(); c.moveTo(B2.X(lo), B2.Y(0.5)); c.lineTo(B2.X(hi), B2.Y(0.5)); c.stroke(); c.setLineDash([]);
    text(c, '−6 dB', B2.X(hi) + 3, B2.Y(0.5) + 3, F.mono(7.5), tk.accent);
  }

  // ── 3. TGC / attenuation: mean received level vs depth (before TGC), the TGC curve, the noise floor ──
  function tgcInst(S, tk, sc) {
    const { c, w, h } = prep(cv.tgc, sc), B = S.B;
    if (!B) return;
    const D = B.depth / 10;
    const { X, Y } = axes(c, tk, { x: 34, y: 8, w: w - 44, h: h - 38, x0: 0, x1: D, y0: -100, y1: 20, xt: ticks(D), yt: [-100, -80, -60, -40, -20, 0, 20], xl: t('tgc.x'), yl: 'dB' });
    const xs = [], ys = [];
    for (let s = 20; s < B.NS; s += 20) { let m = 0; for (let k = -10; k < 10; k++) m += B.rx[s + k] ?? B.rx[s]; xs.push(s * B.dz / 10); ys.push(m / 20); }
    plot(c, xs, ys, X, Y, tk.ink, 1.1, [4, 2]);
    const zs = Array.from({ length: 61 }, (_, i) => D * i / 60);
    plot(c, zs, zs.map((z) => tgc(z * 10, S.f, B.depth, S.tgc) - 40), X, Y, tk.accent, 1.4);
    plot(c, [0, D], [B.noise, B.noise], X, Y, tk['ink-2'], 1, [1, 2]);
    const lx = w - 128;
    const key = (y, col, dash, s) => { c.strokeStyle = col; c.setLineDash(dash); c.lineWidth = 1.3; c.beginPath(); c.moveTo(lx, y); c.lineTo(lx + 16, y); c.stroke(); c.setLineDash([]); text(c, s, lx + 20, y + 3, F.cond(9, 600), tk['ink-2']); };
    key(16, tk.ink, [4, 2], t('tgc.rx')); key(28, tk.accent, [], t('tgc.tgc')); key(40, tk['ink-2'], [1, 2], t('tgc.noise'));
    void TGCMAX;
  }

  // ── 4. delay profile: per-element transmit delays for the red line (curved array + focus) ──
  function delayInst(S, tk, sc) {
    const { c, w, h } = prep(cv.delay, sc);
    const D = delays({ line: S.stone.th, focus: S.focus }), mx = 6;
    const { X, Y } = axes(c, tk, { x: 34, y: 8, w: w - 44, h: h - 38, x0: 0.5, x1: 128.5, y0: 0, y1: mx, xt: [1, 32, 64, 96, 128], yt: [0, 2, 4, 6], xl: t('delay.x'), yl: 'µs' });
    for (let i = 0; i < 128; i++) {
      const v = D.d[i], on = i >= D.i0 && i < D.i0 + D.active;
      c.fillStyle = on ? tk.ink : alpha(tk.ink, 0.15);
      const x0 = X(i + 0.6), x1 = X(i + 1.4);
      c.fillRect(x0, Y(on ? v : 0) - (on ? 0 : 1.5), Math.max(0.8, x1 - x0), on ? Y(0) - Y(v) : 1.5);
    }
    text(c, `${t('delay.focus')} ${S.focus} mm · ${D.active} ${t('delay.active')}`, w - 12, 18, F.cond(9, 600), tk['ink-2'], 'right');
  }

  // ── left: spec block (S1 values, live cell) and penetration vs frequency (computed, live dot) ──
  function specInst(S, tk, sc) {
    const { c, w, h } = prep(cv.spec, sc), rh = Math.min(20, (h - 4) / 5);
    const rows = [['spec.fov', '67.5°'], ['spec.band', '5–2 MHz', true], ['spec.ap', '60 mm'], ['spec.roc', '50 mm'], ['spec.depth', '30 cm']];
    rows.forEach(([k, v, live], i) => {
      const y = 2 + i * rh;
      if (live) { c.fillStyle = alpha(tk.ink, 0.1); c.fillRect(0, y, w, rh); }
      text(c, t(k), 8, y + rh / 2 + 4, F.cond(11, 600), live ? tk.ink : tk['ink-2']);
      text(c, v, w - 8, y + rh / 2 + 4, F.mono(11, 500), tk.ink, 'right');
      c.strokeStyle = tk['rule-soft']; c.setLineDash([1, 2]); c.beginPath(); c.moveTo(4, y + rh); c.lineTo(w - 4, y + rh); c.stroke(); c.setLineDash([]);
    });
  }
  function penInst(S, tk, sc) {
    const { c, w, h } = prep(cv.pen, sc);
    const { X, Y } = axes(c, tk, { x: 34, y: 6, w: w - 46, h: h - 32, x0: 1, x1: 6, y0: 0, y1: 30, xt: [1, 2, 3, 4, 5, 6], yt: [0, 10, 20, 30], xl: t('pen.x'), yl: 'cm' });
    const fs = Array.from({ length: 51 }, (_, i) => 1 + i * 0.1);
    c.fillStyle = alpha(tk.ink, 0.08); c.fillRect(X(2), 6, X(5) - X(2), h - 32);
    plot(c, fs, fs.map((f) => penetration(f) / 10), X, Y, tk.ink, 1.3);
    c.fillStyle = tk.accent; c.beginPath(); c.arc(X(S.f), Y(S.pen / 10), 3.2, 0, Math.PI * 2); c.fill();
    text(c, `${num(S.pen / 10, 0)} cm`, X(S.f) + 6, Y(S.pen / 10) - 4, F.mono(8.5, 500), tk.accent);
  }

  return {
    draw(S, tk, sc) { aline(S, tk, sc); pulseInst(S, tk, sc); tgcInst(S, tk, sc); delayInst(S, tk, sc); specInst(S, tk, sc); penInst(S, tk, sc); },
  };
}
const ticks = (D) => { const st = D > 16 ? 5 : D > 8 ? 4 : 2; return Array.from({ length: Math.floor(D / st) + 1 }, (_, i) => i * st); };
