// Plate layout (generic). Desktop: the fixed design plate (1440 × 900) scaled to fit the window, no scroll.
// Phone (narrow or portrait window): `html.phone`, the same elements re-flowed by CSS into one column of
// `colW` plate px, scaled to the window width; the page scrolls and the full-window WebGL canvas stays fixed,
// so every renderer keeps drawing into getBoundingClientRect() of its element.

export function createLayout({ plates, renderer, design = [1440, 900], onChange }) {
  const root = document.documentElement, ui = plates[plates.length - 1];
  const st = { phone: false, scale: 1, ox: 0, oy: 0, colW: 400 };

  function apply() {
    const W = window.innerWidth, H = window.innerHeight;
    st.phone = new URLSearchParams(location.search).get('layout') === 'phone' || W < 760 || W / H < 0.85;
    root.classList.toggle('phone', st.phone);
    if (st.phone) {
      st.colW = Math.round(Math.min(640, Math.max(400, W / 1.25)));     // tablets in portrait get a wider column
      st.scale = W / st.colW; st.ox = 0; st.oy = 0;
      plates.forEach((p) => (p.style.width = `${st.colW}px`));
      const h = ui.firstElementChild.offsetHeight;
      root.style.setProperty('--plate-h', `${h}px`);
      document.body.style.height = `${Math.ceil(h * st.scale)}px`;
    } else {
      st.scale = Math.min(W / design[0], H / design[1]);
      st.ox = (W - design[0] * st.scale) / 2; st.oy = (H - design[1] * st.scale) / 2;
      plates.forEach((p) => (p.style.width = ''));
      root.style.removeProperty('--plate-h');
      document.body.style.height = '';
    }
    plates.forEach((p) => (p.style.transform = `translate(${st.ox}px, ${st.oy}px) scale(${st.scale})`));
    renderer.setSize(W, H, false);
    onChange?.(st);
  }

  /** film camera (desktop): zoom z × the fitted scale about plate point (cx, cy), clamped so the plate covers the
   *  window where it can; every renderer reads scale / getBoundingClientRect, so they all follow. No onChange. */
  function cam(z, cx, cy) {
    if (st.phone) return;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W / design[0], H / design[1]), s = base * z;
    const fit = (win, size, c) => { const full = size * s; return full <= win ? (win - full) / 2 : Math.min(0, Math.max(win - full, win / 2 - c * s)); };
    st.scale = s; st.ox = fit(W, design[0], cx); st.oy = fit(H, design[1], cy);
    plates.forEach((p) => (p.style.transform = `translate(${st.ox}px, ${st.oy}px) scale(${st.scale})`));
  }

  window.addEventListener('resize', apply);
  window.addEventListener('scroll', () => st.phone && onChange?.(st), { passive: true });
  apply();
  return Object.assign(st, { apply, cam });
}
