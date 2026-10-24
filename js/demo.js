// The scripted demo in the page (generic): film camera (layout zoom onto elements), spotlight (everything but
// the elements of interest dimmed), a fake cursor that presses the real controls, and captions. All pure in film
// time: camera / spot / cursor / caption are evaluated from demo.json at t, every frame (seek-safe).
// The solver commands and the view schedule come from demo-plan.js; main.js feeds them to its log and views.

import { plan, smooth, captionAt } from './demo-plan.js';

export async function loadDemo(url = './demo.json') {
  const D = await (await fetch(url)).json();
  return plan(D);
}

export function createDemo(pl, { L, lang, design = [1440, 900], rectOf = {} }) {
  const $ = (q) => document.querySelector(q);
  // ── layers (screen space, above the plates) ────────────────────────────────
  const spot = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); spot.id = 'demo-spot';
  const cursor = document.createElement('div'); cursor.id = 'demo-cursor';
  cursor.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 2.5v17.2l4.3-4.1 2.9 6.6 2.9-1.3-2.9-6.5h6z"/></svg><i></i>';
  const cap = document.createElement('div'); cap.id = 'demo-cap'; cap.lang = lang;
  document.body.append(spot, cursor, cap);

  // element rect in plate px (from the current layout transform) and in window px
  const plateRect = (q) => { if (rectOf[q]) return rectOf[q](plateRect); const r = $(q).getBoundingClientRect(); return { x: (r.left - L.ox) / L.scale, y: (r.top - L.oy) / L.scale, w: r.width / L.scale, h: r.height / L.scale }; };
  const union = (sels) => sels.map(plateRect).reduce((a, r) => {
    const x0 = Math.min(a.x, r.x), y0 = Math.min(a.y, r.y), x1 = Math.max(a.x + a.w, r.x + r.w), y1 = Math.max(a.y + a.h, r.y + r.h);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  });

  // ── camera: keys → { z, cx, cy }, each blending from wherever the previous one was ───────────────────
  let rects = null;                                      // plate rects of every key's selectors, measured once
  function target(k) {
    if (k.full) return { z: 1, cx: design[0] / 2, cy: design[1] / 2 };
    const r = rects.get(k), W = window.innerWidth, H = window.innerHeight, base = Math.min(W / design[0], H / design[1]);
    const pad = k.pad ?? 0.03;
    const z = k.z ?? Math.min(3, Math.min(W / (r.w * (1 + 2 * pad)), H / (r.h * (1 + 2 * pad))) / base);
    const at = k.at || [0.5, 0.5];
    return { z, cx: r.x + r.w * at[0], cy: r.y + r.h * at[1] };
  }
  const lerpCam = (a, b, u) => ({ z: a.z * (b.z / a.z) ** u, cx: a.cx + (b.cx - a.cx) * u, cy: a.cy + (b.cy - a.cy) * u });
  function camAt(t) {
    const K = pl.camera; if (!K.length) return { z: 1, cx: design[0] / 2, cy: design[1] / 2 };
    let from = target(K[0]), to = from, t0 = K[0].t, dur = 0;
    const at = (x) => lerpCam(from, to, dur > 0 ? smooth((x - t0) / dur) : 1);
    for (let i = 1; i < K.length && K[i].t <= t + 1e-9; i++) { from = at(K[i].t); to = target(K[i]); t0 = K[i].t; dur = K[i].dur; }
    return at(t);
  }

  // ── spotlight: keys → two layers (the old holes fading out, the new ones in) ────────────────────────
  function spotAt(t) {
    let prev = { sels: [], a: 0 }, cur = { sels: [], a: 0 }, t0 = -1, dur = 0;
    for (const k of pl.spot) {
      if (k.t > t + 1e-9) break;
      const u = dur > 0 ? smooth((k.t - t0) / dur) : 1;
      prev = u < 1 ? (prev.a * (1 - u) > cur.a * u ? prev : cur) : cur;    // a key mid-fade keeps the stronger layer
      cur = k.off ? { sels: [], a: 0 } : { sels: k.on, a: k.a ?? 0.6 }; t0 = k.t; dur = k.dur;
    }
    const u = dur > 0 ? smooth((t - t0) / dur) : 1;
    return [{ ...prev, a: prev.a * (1 - u) }, { ...cur, a: cur.a * u }];
  }
  function drawSpot(layers) {
    const W = window.innerWidth, H = window.innerHeight, P = 6;
    spot.setAttribute('viewBox', `0 0 ${W} ${H}`);
    spot.innerHTML = layers.filter((l) => l.a > 0.003).map((l) => {
      const holes = l.sels.map((q) => { const r = $(q).getBoundingClientRect(); return `M${r.left - P},${r.top - P}h${r.width + 2 * P}v${r.height + 2 * P}h${-r.width - 2 * P}z`; }).join('');
      return `<path fill-rule="evenodd" fill-opacity="${l.a.toFixed(3)}" d="M0,0H${W}V${H}H0Z${holes}"/>`;
    }).join('');
  }

  // ── cursor: in from the lower right, onto the control, press; drags follow the slider thumb ──────────
  const IN = 0.9, OUT = 0.6;
  const targetEl = (a) => (a.kind === 'drag' ? $(`.slider[data-key="${a.target}"] .sl-thumb`) : $(a.target === 'knob' ? '.knob' : a.target));
  function drawCursor(t) {
    const a = pl.acts.find((x) => t >= x.t - IN && t <= (x.t1 ?? x.t) + OUT);
    if (!a) { cursor.style.opacity = 0; return; }
    const r = targetEl(a).getBoundingClientRect(), k = innerHeight / 1080;
    const tx = r.left + r.width / 2, ty = r.top + r.height / 2;
    const u = smooth((t - (a.t - IN)) / (IN - 0.15));
    const x = tx + (1 - u) * 160 * k, y = ty + (1 - u) * 120 * k;
    const alpha = Math.min(1, (t - (a.t - IN)) / 0.2, ((a.t1 ?? a.t) + OUT - t) / 0.3);
    const press = t >= a.t && t < a.t + 0.12 ? 0.86 : 1, ring = (t - a.t) / 0.4;
    Object.assign(cursor.style, { opacity: alpha, transform: `translate(${x}px, ${y}px) scale(${k * press})` });
    const i = cursor.querySelector('i');
    i.style.opacity = ring >= 0 && ring < 1 && a.kind === 'click' ? 1 - ring : 0;
    i.style.transform = `translate(-50%, -50%) scale(${0.3 + 1.2 * Math.max(0, ring)})`;
  }

  function drawCaption(t) {
    const c = captionAt(pl, t, lang);
    cap.textContent = c ? c.text : '';
    cap.style.opacity = c ? c.a : 0;
    cap.style.fontSize = `${(lang === 'zh' ? 36 : 32) * innerHeight / 1080}px`;
  }

  return {
    /** before the frame renders: the camera (so every renderer sees this frame's scale and rects) */
    camera(t) {
      if (!rects) { L.cam(1, design[0] / 2, design[1] / 2); rects = new Map(pl.camera.filter((k) => k.fit).map((k) => [k, union(k.fit)])); }
      const c = camAt(t); L.cam(c.z, c.cx, c.cy);
    },
    /** after the frame: the layers on top */
    overlays(t) { drawSpot(spotAt(t)); drawCursor(t); drawCaption(t); },
  };
}
