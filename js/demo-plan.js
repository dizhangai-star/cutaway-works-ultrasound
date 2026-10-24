// The scripted demo as pure data → schedules (generic, no DOM): solver commands for the page's log, the view
// schedule, the cursor's actions, camera / spot keys and captions, all functions of film time.
// Used by js/demo.js in the page and by tools/demo-check.mjs in Node (the same timeline replayed through the solver).

const RAMP_DT = 1 / 30;
export const smooth = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };

export function plan(D) {
  const sim = [], views = [], acts = [];
  const cur = {};                                          // set values as the timeline goes (ramps start from them)
  for (const c of [...D.cmds].sort((a, b) => a.t - b.t)) {
    if (c.set) for (const [k, v] of Object.entries(c.set)) { sim.push({ t: c.t, k: 'set', p: k, v }); cur[k] = v; }
    if (c.do) { sim.push({ t: c.t, k: c.do === 'expose' ? 'expose' : c.do }); if (c.click) acts.push({ t: c.t, kind: 'click', target: c.click }); }
    if (c.view) views.push({ t: c.view && c.t, view: c.view });
    if (c.ramp) {
      const { k, to, dur } = c.ramp, from = cur[k], n = Math.max(1, Math.round(dur / RAMP_DT));
      const snap = k === 'kv' ? Math.round : (v) => Math.round(v / 10) * 10;
      let last = from;
      for (let i = 1; i <= n; i++) {
        const v = snap(from + (to - from) * smooth(i / n));
        if (v !== last) { sim.push({ t: c.t + i * dur / n, k: 'set', p: k, v }); last = v; }
      }
      cur[k] = to;
      acts.push({ t: c.t, t1: c.t + dur, kind: 'drag', target: k });
    }
  }
  sim.sort((a, b) => a.t - b.t);
  return { sim, views, acts, camera: D.camera || [], spot: D.spot || [], captions: D.captions || [], initial: D.initial, len: D.len };
}

/** set values (slider positions) at t, from the defaults and the commands so far */
export function setAt(sim, t, def) {
  const P = { ...def };
  for (const c of sim) { if (c.t > t + 1e-9) break; if (c.k === 'set') P[c.p] = c.v; }
  return P;
}

/** the view at t: { view, prev, t0 } (the first view is the initial one, already in place) */
export function viewAt(pl, t) {
  let view = pl.initial.view, prev = view, t0 = pl.initial.t0 ?? -10, prevT0 = -10;
  for (const v of pl.views) { if (v.t > t + 1e-9) break; prev = view; prevT0 = t0; view = v.view; t0 = v.t; }
  return { view, prev, t0, prevT0 };
}

/** the caption on screen at t ({ text, a } with a fade of 0.18 s) */
export function captionAt(pl, t, lang) {
  for (const c of pl.captions) {
    if (t >= c.t && t <= c.t + c.d) return { text: c[lang], a: Math.min(1, (t - c.t) / 0.18, (c.t + c.d - t) / 0.18) };
  }
  return null;
}
