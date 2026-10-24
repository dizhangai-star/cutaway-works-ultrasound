// Materials (subject): the probe palette. The generic hook (noise, section hatch, bump) and setCut / hideRemoved come
// from js/hook.js (plate skill); re-exported here so main.js keeps one import.

import * as THREE from 'three';
import { hook } from './hook.js';
export { SHARED, hook, setCut, hideRemoved } from './hook.js';

export function createMaterials() {
  const phys = (o, h) => hook(new THREE.MeshPhysicalMaterial(o), h);
  const m = {
    // moulded housing: warm-white PC/ABS, satin, faint moulding texture; the only part that prints the red hatch
    housing: phys({ color: 0xe8e4dc, roughness: 0.38, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.22, sheen: 0.2, sheenColor: 0xffffff }, { grain: 0.3, scale: 260, bump: 4e-6, bscale: 2600, env: 1.1 }),
    // soft-touch grip insert, pale grey
    grip: phys({ color: 0xb9bec2, roughness: 0.72, metalness: 0.0, clearcoat: 0.1 }, { grain: 0.4, scale: 600, bump: 5e-6, bscale: 4000 }),
    // the acoustic stack, never cut so the layers read
    lens: phys({ color: 0x3a4148, roughness: 0.48, metalness: 0.0, clearcoat: 0.55, clearcoatRoughness: 0.3 }, { grain: 0.4, scale: 700 }),
    match2: phys({ color: 0xc9893a, roughness: 0.36, metalness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.15 }, { grain: 0.3, scale: 900, cut: false }),
    match1: phys({ color: 0xe0ad5a, roughness: 0.3, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.12 }, { grain: 0.3, scale: 900, cut: false }),
    pzt: phys({ color: 0x9da3a8, roughness: 0.34, metalness: 0.55 }, { grain: 0.5, scale: 1500, cut: false, env: 1.3 }),
    foil: phys({ color: 0xd8c08a, roughness: 0.22, metalness: 1.0 }, { grain: 0.3, cut: false, env: 1.5 }),
    backing: phys({ color: 0x17181a, roughness: 0.82, metalness: 0.1 }, { grain: 1.2, scale: 900, bump: 6e-6, bscale: 5000, cut: false }),
    frame: phys({ color: 0x8d949a, roughness: 0.3, metalness: 1.0 }, { grain: 0.4, env: 1.4 }),
    epoxy: phys({ color: 0x5a3f1e, roughness: 0.3, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.1 }, { grain: 0.4, scale: 900, cut: false }),
    label: phys({ color: 0xd2d0ca, roughness: 0.62, metalness: 0.0 }, { grain: 0.3, scale: 900, cut: false }),
    // electronics
    flex: phys({ color: 0xc98a2a, roughness: 0.35, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.1, side: THREE.DoubleSide }, { grain: 0.6, scale: 1200, cut: false }),
    pcb: phys({ color: 0x1d5a3a, roughness: 0.42, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.2 }, { grain: 0.6, scale: 1400, cut: false }),
    chip: phys({ color: 0x141518, roughness: 0.5, metalness: 0.1, clearcoat: 0.3 }, { grain: 0.4, cut: false }),
    pins: phys({ color: 0xd9dcdc, roughness: 0.25, metalness: 1.0 }, { grain: 0.2, cut: false, env: 1.6 }),
    screw: phys({ color: 0xa9adb0, roughness: 0.28, metalness: 1.0 }, { grain: 0.3, cut: false, env: 1.5 }),
    pad: phys({ color: 0x8a8f94, roughness: 0.85, metalness: 0.0 }, { grain: 0.8, scale: 1500, cut: false }),
    braid: phys({ color: 0xb8bcbe, roughness: 0.4, metalness: 1.0 }, { grain: 2.0, scale: 3000, bump: 1.5e-5, bscale: 6000, cut: false, env: 1.3 }),
    alu: phys({ color: 0xc4c9cc, roughness: 0.3, metalness: 1.0 }, { grain: 0.4, scale: 400, cut: false, env: 1.4 }),
    // cable and strain relief
    rubber: phys({ color: 0x1a1b1d, roughness: 0.6, metalness: 0.0, clearcoat: 0.25, clearcoatRoughness: 0.4 }, { grain: 0.5, cut: false }),
    cable: phys({ color: 0x202224, roughness: 0.45, metalness: 0.0, clearcoat: 0.4, clearcoatRoughness: 0.25 }, { grain: 0.3, cut: false }),
    // the phantom block on the bench: clear gel, gel film
    block: new THREE.MeshPhysicalMaterial({ color: 0xcfe2ea, roughness: 0.08, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false, side: THREE.DoubleSide }),
    gel: new THREE.MeshPhysicalMaterial({ color: 0xe6f2f6, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.45, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false }),
  };
  // stepped cut: the lens opens only in front of the matching-layer faces (z > 7.3 mm)
  m.lens.userData.extraCut = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.0073)];
  m.block.userData.cuttable = false; m.gel.userData.cuttable = false;
  m.block.userData.env = 1.6; m.gel.userData.env = 2.0;
  return m;
}
