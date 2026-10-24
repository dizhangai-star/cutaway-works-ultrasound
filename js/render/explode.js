// Exploded view (generic): groups of parts slide out along their own offsets, staggered, eased; each group has a
// label anchor that travels with it. `e` = 0 (assembled) … 1 (apart), a pure function of the caller's time.
//
// De-overlap: the offsets give each group its direction and a least distance; the distance is then grown so that
// no two groups (nor a group and a fixed obstacle, e.g. the stand's cradles) overlap on screen at e = 1. Each part
// is its box's 8 corners, projected; a group is the list of its parts' screen rects. solve() is a pure function of
// the camera it is given (k = 1 tried first, then grown); the caller picks that camera and when to solve again.

import * as THREE from 'three';

const ease = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };

const PAD = 10;           // px of air kept between two groups
const TOL = 24;           // px² of overlap (summed over part pairs) that still counts as clear
const KMAX = 2.6;         // a group never goes further than this × its own offset
const STEP = 0.08, BISECT = 6, PASSES = 3;

/** groups: [{ key, objs: Object3D[], off: Vector3, order, hide?: bool }]; a hidden group vanishes once e > 0.
 *  obstacles: Object3D[] that never move (their screen rects push the groups away); frame: Object3D[] that never
 *  move and must stay in the picture (fit()) */
export function createExplode(root, groups, { obstacles = [], frame = [] } = {}) {
  root.updateMatrixWorld(true);
  const n = Math.max(...groups.map((g) => g.order)) + 1, box = new THREE.Box3();
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), rootQ = root.getWorldQuaternion(new THREE.Quaternion());
  // the 8 corners of an object's world box at e = 0, kept in root space
  const corners = (o) => {
    box.setFromObject(o); const { min: a, max: b } = box, c = [];
    for (let i = 0; i < 8; i++) c.push(new THREE.Vector3(i & 1 ? b.x : a.x, i & 2 ? b.y : a.y, i & 4 ? b.z : a.z).applyMatrix4(inv));
    return c;
  };
  const G = groups.map((g) => {
    box.makeEmpty(); g.objs.forEach((o) => box.expandByObject(o));
    return { ...g, base: g.objs.map((o) => o.position.clone()), centre: box.getCenter(new THREE.Vector3()).applyMatrix4(inv), u: 0, k: 1,
      parts: g.objs.map((o) => ({ o, c: corners(o) })),
      // the offset is given in root space; each part moves in its parent's space (a parent may be rotated)
      loc: g.objs.map((o) => g.off.clone().applyQuaternion(rootQ.clone().premultiply(o.parent.getWorldQuaternion(new THREE.Quaternion()).invert()))),
      vis: g.objs.map((o) => o.visible) };
  });
  // hidden groups dissolve out first (hook materials only they use: userData.dis), then hide; no part pops
  const mats = (gs) => { const m = new Set(); for (const g of gs) for (const o of g.objs) o.traverse((x) => x.isMesh && m.add(x.material)); return m; };
  const others = mats(G.filter((g) => !g.hide)), dis = [...mats(G.filter((g) => g.hide))].filter((m) => m.userData.dis && !others.has(m));
  let lastE = 0;
  const DIS = dis.length ? 0.2 : 0.001;                      // e over which they burn away
  const fixed = obstacles.map((o) => ({ o, c: corners(o) }));
  const still = frame.map((o) => ({ o, c: corners(o) }));
  const at = new THREE.Vector3(), d = new THREE.Vector3();

  // screen rects [x0, y0, x1, y1] of parts moved by off × k (root space), through project(world) → [x, y] px
  function rects(parts, off, k, project) {
    const out = [];
    for (const p of parts) {
      if (!p.o.visible) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of p.c) {
        d.copy(c); if (off) d.addScaledVector(off, k);
        const [x, y] = project(d.applyMatrix4(root.matrixWorld));
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      out.push([x0, y0, x1, y1]);
    }
    return out;
  }
  function overlap(A, B) {
    let s = 0;
    for (const a of A) for (const b of B) {
      const w = Math.min(a[2], b[2]) + PAD - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) + PAD - Math.max(a[1], b[1]);
      if (w > 0 && h > 0) s += w * h;
    }
    return s;
  }
  const cost = overlap;

  /** grow each movable group's k until the screen is clear (or KMAX stops it); the frame is fitted afterwards */
  function solve(project) {
    const mov = G.filter((g) => !g.hide && g.off.lengthSq() > 0);
    mov.forEach((g) => (g.k = 1));
    const obs = fixed.length ? rects(fixed, null, 0, project) : null;
    const R = (g, k = g.k) => rects(g.parts, g.off, k, project);
    // the least k ≥ g.k at which g clears `other` (rects); null if none up to KMAX
    function clear(g, other) {
      const ok = (k) => cost(R(g, k), other) <= TOL;
      let lo = g.k, hi = null;
      for (let k = g.k + STEP; k <= KMAX + 1e-9; k += STEP) { if (ok(k)) { hi = k; break; } lo = k; }
      if (hi == null) return null;
      for (let i = 0; i < BISECT; i++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
      return hi;
    }
    for (let pass = 0; pass < PASSES; pass++) {
      let moved = false;
      for (let i = 0; i < mov.length; i++) {
        const a = mov[i];
        if (obs && cost(R(a), obs) > TOL) { const k = clear(a, obs); if (k != null) { a.k = k; moved = true; } }
        for (let j = i + 1; j < mov.length; j++) {
          const b = mov[j], ra = R(a), rb = R(b);
          if (cost(ra, rb) <= TOL) continue;
          // the group that comes out later moves first (it is the inner part); then the other one
          const [p, q] = b.order >= a.order ? [b, a] : [a, b];
          let k = clear(p, p === b ? ra : rb);
          if (k != null) { p.k = k; moved = true; continue; }
          k = clear(q, R(p));
          if (k != null) { q.k = k; moved = true; }
        }
      }
      if (!moved) break;
    }
    mov.forEach((g) => (g.rects = R(g))); G.obs = obs;          // for debugging overlays
    // everything on screen at e = 1 (the groups where they end, plus the parts that never move)
    const all = mov.flatMap((g) => g.rects).concat(rects(still, null, 0, project));
    G.box = all.reduce((a, r) => [Math.min(a[0], r[0]), Math.min(a[1], r[1]), Math.max(a[2], r[2]), Math.max(a[3], r[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  }

  return {
    groups: G,
    /** de-overlap for a camera: project = world → [x, y] px (sets each group's k; call again when the camera moves) */
    solve,
    /** e: 0 … 1 */
    apply(e) {
      // only while exploded (or the step back to 0): at rest the dissolve belongs to others (ghost.js)
      if (e > 0 || lastE > 0) for (const m of dis) m.userData.dis.value = Math.min(1, e / DIS);
      lastE = e;
      for (const g of G) {
        g.u = ease(e * (1 + 0.35 * (n - 1)) - 0.35 * g.order);
        g.objs.forEach((o, i) => {
          o.position.copy(g.base[i]).addScaledVector(g.loc[i], g.u * g.k);
        });
        // hidden groups: remember what they were (the cut may have hidden some) and give it back at e = 0
        if (g.hide && (e >= DIS) !== !!g.hidden) {
          g.hidden = e >= DIS;
          g.objs.forEach((o, i) => { if (g.hidden) { g.vis[i] = o.visible; o.visible = false; } else o.visible = g.vis[i]; });
        }
      }
    },
    /** after solve(): { z, dx, dy } = zoom about `c` [x, y] px, then a shift in px, that centres the whole
     *  set at e = 1 in `b` [x0, y0, x1, y1] px and fills it (z ≤ zmax; the de-overlap is scale-invariant) */
    fit(c, b, zmax = 1.2) {
      const B = G.box; if (!B || !Number.isFinite(B[0])) return { z: 1, dx: 0, dy: 0 };
      const z = Math.min(zmax, (b[2] - b[0]) / (B[2] - B[0]), (b[3] - b[1]) / (B[3] - B[1]));
      // box centre after the zoom about c, moved onto the bounds' centre
      return { z, dx: (b[0] + b[2]) / 2 - (c[0] + ((B[0] + B[2]) / 2 - c[0]) * z), dy: (b[1] + b[3]) / 2 - (c[1] + ((B[1] + B[3]) / 2 - c[1]) * z) };
    },
    /** how far out the furthest-ahead group is (0 … 1) at e (pure), for blending the camera with the parts */
    lead: (e) => Math.max(0, ...G.map((g) => ease(e * (1 + 0.35 * (n - 1)) - 0.35 * g.order))),
    /** label anchor of a group in world space (its centre, moved with it, plus an optional local nudge) */
    anchor(g) { return at.copy(g.centre).add(g.nudge || new THREE.Vector3()).addScaledVector(g.off, g.u * g.k).applyMatrix4(root.matrixWorld); },
  };
}
