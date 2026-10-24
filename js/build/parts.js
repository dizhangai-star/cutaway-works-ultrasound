// The tube's part groups for the views (subject-specific): exploded directions (+ least distances; render/explode.js
// grows them until nothing overlaps on screen) + labels, numbered balloons,
// and what the Beam view keeps solid. Offsets in metres, root space (housing axis = X, up = Y, camera side = +Z).

import * as THREE from 'three';
import { DIM } from './tube.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function explodeGroups(tube) {
  const { housing, insert, rotor, port, cages, cables } = tube;
  const kids = (g) => g.children;
  const nm = (o) => o.name;
  const cx = (o) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).x;
  const capNames = new Set(['end cap', 'bellows cap', 'anode end boss', 'cap bolt', 'clamp ring', 'clamp lug']);
  const capObjs = kids(housing).filter((o) => capNames.has(nm(o)));
  const housingObjs = kids(housing).filter((o) => o !== port && nm(o) !== 'oil' && !cables.includes(o) && !capNames.has(nm(o)));
  const oil = kids(housing).filter((o) => nm(o) === 'oil');
  const cath = new Set(['cathode seal', 'feedthrough pin', 'cathode stem', 'cathode arm', 'focusing cup', 'filament lead', 'common lead']);
  const rot = new Set(['bearing shaft', 'inner race', 'anode seal', 'anode terminal']);
  const stat = new Set(['stator core', 'stator winding', 'stator mount']);
  const glass = new Set(['glass envelope', 'glass rim', 'cathode support', 'anode support']);
  const leads = new Set(['cathode lead', 'anode lead']);
  const pick = (set) => kids(insert).filter((o) => set.has(nm(o)));
  return [
    { key: 'x.housing', objs: housingObjs, off: V3(0.04, 0.16, -0.25), order: 0 },
    { key: 'x.caps', objs: capObjs.filter((o) => cx(o) < 0), off: V3(-0.07, 0.16, -0.25), order: 0 },
    { key: 'x.caps', objs: capObjs.filter((o) => cx(o) >= 0), off: V3(0.15, 0.16, -0.25), order: 0, nolabel: true },
    { key: 'oil', objs: [...oil, ...cables, ...pick(leads)], off: V3(0, 0, 0), order: 0, hide: true, nolabel: true },
    { key: 'x.port', objs: [port], off: V3(0, -0.03, 0.14), order: 1 },
    { key: 'x.glass', objs: pick(glass), off: V3(0.02, 0.07, -0.02), order: 1 },
    { key: 'x.cathode', objs: pick(cath), off: V3(-0.07, 0.07, 0.12), order: 2 },
    { key: 'x.rotor', objs: [rotor, ...cages, ...pick(rot)], off: V3(0, 0.10, 0.12), order: 2 },
    { key: 'x.stator', objs: pick(stat), off: V3(0.14, 0.05, 0.08), order: 3 },
  ];
}

/** what stays put in the exploded view and must not be covered: the stand's two cradles (the base plate is the floor) */
export const explodeObstacles = (tube) => tube.stand.children.filter((o) => ['cradle', 'saddle liner'].includes(o.name));

/** numbered balloons (Cutaway / Beam): anchor in world space, direction of the circle on screen (plate px) */
export const BALLOONS = [
  { n: 1, key: 'b.cathode', at: DIM.cathode.clone().add(V3(-0.012, 0.004, 0.01)), dir: [-1, -1.6] },
  { n: 2, key: 'b.beam', at: V3(-0.012, -0.030, 0.002), dir: [-0.2, -1] },
  { n: 3, key: 'b.disc', at: V3(0.006, 0.028, 0.012), dir: [0.3, -1] },
  { n: 4, key: 'b.rotor', at: V3(0.09, 0.03, 0.018), dir: [0.6, -1] },
  { n: 5, key: 'b.window', at: V3(0, -0.079, 0.03), dir: [-1, 0.5] },
  { n: 6, key: 'b.oil', at: V3(0.17, -0.04, 0.03), dir: [1, 0.8] },
];

/** parts that stay solid in the Beam view: where the electrons start and land, and where the X-rays leave */
export const beamKeep = (o) => {
  for (let p = o; p; p = p.parent) {
    if (p.name === 'focusing cup' || p.name === 'window') return true;
    if (['anode disc', 'focal track', 'graphite backing', 'disc nut', 'disc mark'].includes(p.name)) return true;
  }
  return false;
};
