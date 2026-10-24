// Small geometry helpers (generic). Units: metres. Axis convention: lathe parts turn round +X.

import * as THREE from 'three';

/** Solid of revolution round the X axis. `prof` = [[r, x], ...]; a closed loop gives a closed solid.
 *  Points go round the loop so the outer surface faces out (outer edge walked from -x to +x). */
export function latheX(prof, segs = 96, crease = 35) {
  // own lathe: each profile segment is its own strip; normals are smoothed across a profile vertex only when
  // the bend is under `crease` degrees, so machined steps stay sharp and domes stay round.
  const cosC = Math.cos(crease * Math.PI / 180);
  const segN = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, x0] = prof[i], [r1, x1] = prof[i + 1];
    const dx = x1 - x0, dr = r1 - r0, l = Math.hypot(dx, dr) || 1;
    segN.push([dx / l, -dr / l]);             // (nr, nx): outward when the outer edge runs -x → +x
  }
  const pos = [], nor = [], idx = [];
  const nAt = (i, end) => {                   // normal of segment i at its start (end=0) or end (end=1)
    const n = segN[i], j = end ? i + 1 : i - 1;
    const m = segN[j];
    if (!m || (n[0] * m[0] + n[1] * m[1]) < cosC) return n;
    const s = [n[0] + m[0], n[1] + m[1]], l = Math.hypot(...s); return [s[0] / l, s[1] / l];
  };
  for (let i = 0; i < segN.length; i++) {
    const [r0, x0] = prof[i], [r1, x1] = prof[i + 1];
    if (Math.hypot(r1 - r0, x1 - x0) < 1e-9) continue;
    const n0 = nAt(i, 0), n1 = nAt(i, 1), base = pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const p = (s / segs) * Math.PI * 2, c = Math.cos(p), sn = Math.sin(p);
      pos.push(x0, r0 * c, r0 * sn, x1, r1 * c, r1 * sn);
      nor.push(n0[1], n0[0] * c, n0[0] * sn, n1[1], n1[0] * c, n1[0] * sn);
    }
    for (let s = 0; s < segs; s++) {
      const a = base + s * 2, b = a + 1, c2 = a + 2, d = a + 3;
      idx.push(a, c2, b, b, c2, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** a tube shell: outer radius ro, inner ri, from x0 to x1 (closed annular solid) */
export function shellX(ro, ri, x0, x1, segs = 96) {
  return latheX([[ri, x0], [ro, x0], [ro, x1], [ri, x1], [ri, x0]], segs);
}

/** solid cylinder between two points */
export function cylBetween(a, b, r, mat, segs = 32, r2 = r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, segs), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}

export function tube(points, r, mat, segs = 120, radial = 18) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  return new THREE.Mesh(new THREE.TubeGeometry(c, segs, r, radial, false), mat);
}

/** hex bolt head, axis +Y */
export function bolt(r, h, mat) {
  const g = new THREE.CylinderGeometry(r, r, h, 6);
  g.translate(0, h / 2, 0);
  return new THREE.Mesh(g, mat);
}

export function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }

export function shadowAll(root) {
  root.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
}

/** a curved panel on a cylinder round X (radius r, x0..x1, angle a0..a1 with 0 = +Y, 90° = +Z), uv: u along +x, v up */
export function panelX(r, x0, x1, a0, a1, nx = 16, na = 8) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j <= na; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + (x1 - x0) * i / nx, a = a0 + (a1 - a0) * j / na, c = Math.cos(a), s = Math.sin(a);
    pos.push(x, r * c, r * s); nor.push(0, c, s); uv.push(i / nx, 1 - j / na);
  }
  for (let j = 0; j < na; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
