// Clock + the `window.__film` contract (generic). Live: rAF drives frame(t, dt). Film (`?film=1`): the clock is
// frozen; the recorder calls start(), step(dt), seek(t), each rendering exactly one frame. `rate()` scales live
// time only (slow motion); film time is always what the recorder steps.
//   api.redraw() renders the current t again (layout change, scroll in film mode).

export function createClock(frame, { isLoaded = () => true, rate = () => 1 } = {}) {
  const film = new URLSearchParams(location.search).has('film');
  let t = 0, running = false, last = 0;

  const api = {
    film,
    get t() { return t; },
    seek(x) { t = x; frame(t, 0); },
    step(dt) { t += dt; frame(t, dt); },
    redraw() { frame(t, 0); },
  };

  window.__film = {
    ready: false,
    loaded: isLoaded,
    start() { t = 0; frame(0, 0); },
    step: (dt) => api.step(dt),
    seek: (x) => api.seek(x),
    get t() { return t; },
  };

  api.start = () => {
    window.__film.ready = true;
    if (film) { frame(t, 0); return; }
    if (running) return; running = true; last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      t += dt * rate(); frame(t, dt * rate());
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  return api;
}
