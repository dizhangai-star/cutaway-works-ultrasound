// Exploded groups of the probe (view 1 Overview). Offsets in the bench's root space (m): the shells part along
// their joint (z), the electronics slide out sideways, the cable lifts off the top; the nose and the acoustic stack
// stay on the gel (the frame the rest flies away from). Order = stagger (0 first).

import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const GROUPS = [
  { key: 'x.back', off: V(0, 0.012, -0.055), order: 0, names: ['housing back shell', 'label (blank)', 'screw boss'] },
  { key: 'x.front', off: V(0, 0.012, 0.06), order: 0, names: ['housing front shell', 'grip insert left', 'grip insert right'] },
  { key: 'x.board', off: V(-0.07, 0.03, 0.07), order: 1, names: ['PCB', 'beamformer ASIC', 'ASIC pins', 'power IC', 'flex connector', 'cable connector', 'flex clamp', 'PCB screw', 'passives'] },
  { key: 'x.heat', off: V(0.06, 0.035, -0.02), order: 1, names: ['heat spreader', 'thermal pad'] },
  { key: 'x.cable', off: V(0, 0.07, 0), order: 2, nudge: V(-0.2, -0.05, 0.0), names: ['cable gland', 'strain relief', 'cable', 'shield braid', 'cable conductors'] },
];
const FRAME = ['nose cone', 'acoustic lens', 'backing block'];

export function explodeGroups(G) {
  const by = (n) => G.probe.children.filter((o) => o.name === n);
  return GROUPS.map((g) => ({ ...g, objs: g.names.flatMap(by) })).filter((g) => g.objs.length);
}
export const explodeFrame = (G) => G.probe.children.filter((o) => FRAME.includes(o.name));
