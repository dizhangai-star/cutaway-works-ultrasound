// Plate controls (generic): drag sliders (linear or log scale, keyboard arrows), stage orbit (drag + wheel).
// Subject wiring (what each control changes) lives in main.js.

/** `.slider` element with `.sl-track/.sl-fill/.sl-thumb/.sl-val`; set(v) gets the snapped value */
export function bindSlider(el, { min, max, log = false, snap = (v) => v, set, get }) {
  const track = el.querySelector('.sl-track'), fill = el.querySelector('.sl-fill'), thumb = el.querySelector('.sl-thumb'), val = el.querySelector('.sl-val');
  const toF = (v) => (log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromF = (f) => { f = Math.min(1, Math.max(0, f)); return snap(log ? min * (max / min) ** f : min + (max - min) * f); };
  const at = (e) => { const r = track.getBoundingClientRect(); set(fromF((e.clientX - r.left) / r.width)); };
  track.tabIndex = 0; track.setAttribute('role', 'slider');
  track.addEventListener('pointerdown', (e) => {
    e.preventDefault(); track.setPointerCapture(e.pointerId); at(e);
    const mv = (ev) => at(ev);
    const up = () => { track.removeEventListener('pointermove', mv); track.removeEventListener('pointerup', up); track.removeEventListener('pointercancel', up); };
    track.addEventListener('pointermove', mv); track.addEventListener('pointerup', up); track.addEventListener('pointercancel', up);
  });
  track.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const v0 = get(); let f = toF(v0);
    for (let i = 0; i < 50; i++) { f += d * 0.01; const v = fromF(f); if (v !== v0 || f <= 0 || f >= 1) { set(v); break; } }
  });
  return {
    draw(v, text) {
      const f = Math.min(1, Math.max(0, toF(v)));
      fill.style.width = `${f * 100}%`; thumb.style.left = `${f * 100}%`; val.textContent = text;
      track.setAttribute('aria-valuenow', v);
    },
  };
}

/** drag to orbit (dx, dy in screen px), wheel to zoom; touch keeps vertical page scroll (touch-action: pan-y) */
export function bindOrbit(el, { drag, wheel }) {
  let last = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    last = { x: e.clientX, y: e.clientY, id: e.pointerId }; el.setPointerCapture(e.pointerId); el.classList.add('drag');
  });
  el.addEventListener('pointermove', (e) => {
    if (!last || e.pointerId !== last.id) return;
    drag(e.clientX - last.x, e.pointerType === 'touch' ? 0 : e.clientY - last.y); last.x = e.clientX; last.y = e.clientY;
  });
  const end = () => { last = null; el.classList.remove('drag'); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => { if (document.documentElement.classList.contains('phone')) return; e.preventDefault(); wheel(e.deltaY); }, { passive: false });
}

/** two significant figures (10, 12, … 95, 100, 120 …) */
export const sig2 = (v) => { const p = 10 ** (Math.floor(Math.log10(v)) - 1); return Math.round(v / p) * p; };
