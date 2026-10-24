// Callouts on the stage (generic): numbered balloons with a legend, and side-column labels with elbow leaders
// (anatomy's layout: labels in two columns outside the object, sorted by height, relaxed so none overlap).
// All coordinates in stage plate px (the stage's own unscaled box); `a` = 0..1 fades the whole layer.

const NS = 'http://www.w3.org/2000/svg';

export function createCallouts({ svg, layer, legend }) {
  const pool = new Map();                         // id → label element (kept, so widths are measured once)
  const el = (id, cls) => {
    let e = pool.get(id);
    if (!e) { e = document.createElement('div'); e.className = cls; layer.appendChild(e); pool.set(id, e); }
    return e;
  };
  let legendKey = '';

  function frame(w, h) { svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', w); svg.setAttribute('height', h); svg.innerHTML = ''; }
  const line = (pts, cls) => { const p = document.createElementNS(NS, 'polyline'); p.setAttribute('points', pts.map((q) => q.join(',')).join(' ')); p.setAttribute('class', cls); svg.appendChild(p); };
  const dot = ([x, y], r, cls) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', r); c.setAttribute('class', cls); svg.appendChild(c); return c; };

  /** push points apart until no two are closer than `gap` (a few relaxation passes, deterministic) */
  function separate(P, gap, w, h, m) {
    for (let it = 0; it < 24; it++) {
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const dx = P[j][0] - P[i][0], dy = P[j][1] - P[i][1], d = Math.hypot(dx, dy) || 1e-3;
        if (d >= gap) continue;
        const k = (gap - d) / 2 / d; P[i][0] -= dx * k; P[i][1] -= dy * k; P[j][0] += dx * k; P[j][1] += dy * k;
      }
      for (const p of P) { p[0] = Math.min(w - m, Math.max(m, p[0])); p[1] = Math.min(h - m, Math.max(m, p[1])); }
    }
    return P;
  }

  /** items: { n, key, text, at: [x, y], dir: [dx, dy] }; the circle sits `len` px out along dir */
  function balloons(items, { w, h, a = 1, len = 58, r = 10 }) {
    frame(w, h); svg.style.opacity = a;
    for (const e of pool.values()) e.style.display = 'none';
    if (a <= 0.001) { legend.style.opacity = 0; return; }
    const P = separate(items.map((b) => { const L = Math.hypot(...b.dir) || 1; return [b.at[0] + b.dir[0] / L * len, b.at[1] + b.dir[1] / L * len]; }), 2 * r + 6, w, h, r + 4);
    items.forEach((b, i) => {
      const [cx, cy] = P[i], dx = b.at[0] - cx, dy = b.at[1] - cy, d = Math.hypot(dx, dy) || 1;
      line([[cx + dx / d * r, cy + dy / d * r], b.at], 'ld');
      dot(b.at, 1.8, 'ld-dot');
      dot([cx, cy], r, 'bl');
      const tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', cx); tx.setAttribute('y', cy + 3.4); tx.setAttribute('class', 'bl-n'); tx.textContent = String(b.n).padStart(2, '0'); svg.appendChild(tx);
    });
    const key = items.map((b) => `${b.n}:${b.text}`).join('|');
    if (key !== legendKey) { legendKey = key; legend.innerHTML = items.map((b) => `<li><i>${String(b.n).padStart(2, '0')}</i>${b.text}</li>`).join(''); }
    legend.style.opacity = a;
  }

  /** items: { id, text, at: [x, y], side?: -1 | 1 }; labels in two columns at `inset` px from the stage sides */
  function labels(items, { w, h, a = 1, inset = 14, top = 70, bottom = 60, gap = 5 }) {
    frame(w, h); svg.style.opacity = a; legend.style.opacity = 0;
    const live = new Set(items.map((i) => i.id));
    for (const [id, e] of pool) if (!live.has(id)) e.style.display = 'none';
    if (a <= 0.001) { for (const e of pool.values()) e.style.display = 'none'; return; }
    const L = items.map((it) => {
      const e = el(it.id, 'co'); e.style.display = ''; e.style.opacity = a;
      if (e.textContent !== it.text) e.textContent = it.text;
      return { ...it, e, side: it.side ?? (it.at[0] < w / 2 ? -1 : 1), bw: e.offsetWidth, bh: e.offsetHeight };
    });
    for (const side of [-1, 1]) {
      const col = L.filter((l) => l.side === side).sort((p, q) => p.at[1] - q.at[1]);
      // ideal y = the anchor's; then sweep down / up so boxes keep `gap` apart, inside [top, h - bottom]
      col.forEach((l) => (l.y = Math.min(h - bottom - l.bh / 2, Math.max(top + l.bh / 2, l.at[1]))));
      for (let it = 0; it < 4; it++) {
        for (let i = 1; i < col.length; i++) { const p = col[i - 1], q = col[i], min = p.y + (p.bh + q.bh) / 2 + gap; if (q.y < min) q.y = min; }
        const last = col[col.length - 1];
        if (last && last.y > h - bottom - last.bh / 2) {
          last.y = h - bottom - last.bh / 2;
          for (let i = col.length - 2; i >= 0; i--) { const p = col[i], q = col[i + 1], max = q.y - (p.bh + q.bh) / 2 - gap; if (p.y > max) p.y = max; }
        }
      }
      for (const l of col) {
        const x0 = side < 0 ? inset : w - inset - l.bw;
        l.e.style.left = `${x0}px`; l.e.style.top = `${l.y - l.bh / 2}px`;
        const ex = side < 0 ? x0 + l.bw + 3 : x0 - 3, kx = ex - side * 14;
        line([[ex, l.y], [kx, l.y], l.at], 'ld');
        dot(l.at, 1.8, 'ld-dot');
      }
    }
  }

  function hide() { frame(1, 1); legend.style.opacity = 0; for (const e of pool.values()) e.style.display = 'none'; }
  return { balloons, labels, hide };
}
