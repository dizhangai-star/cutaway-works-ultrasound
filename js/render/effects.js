// The invisible thing made visible, in the hero: the scan line (red, from the active aperture down through the gel
// block) and the transmit pulse travelling down it as a thin arc. Deterministic in film time, so seek() gives the
// same frame. The B-mode picture itself is the 2D film on the stage (main.js).

import * as THREE from 'three';
import { DIM } from '../build/probe.js';

export function createEffects(root) {
  const g = new THREE.Group(); g.name = 'effects'; root.add(g);
  const red = new THREE.MeshBasicMaterial({ color: 0xff3a32, transparent: true, depthWrite: false, depthTest: false });
  // scan line: apex at the lens, down to the bottom of the block (the 2D film continues it)
  const lineGeo = new THREE.CylinderGeometry(0.00028, 0.00028, 1, 8); lineGeo.translate(0, -0.5, 0);
  const line = new THREE.Mesh(lineGeo, red); line.renderOrder = 20; line.userData.noDrawing = true; g.add(line);
  // pulse: a short arc of the wavefront, expanding from the face
  const arcGeo = new THREE.TorusGeometry(1, 0.012, 6, 48, 0.5); arcGeo.rotateZ(-Math.PI / 2 - 0.25);
  const pulseMat = new THREE.MeshBasicMaterial({ color: 0xffb4a8, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const pulse = new THREE.Mesh(arcGeo, pulseMat); pulse.renderOrder = 21; pulse.userData.noDrawing = true; g.add(pulse);
  const len = -DIM.floor - 0.001;

  return {
    line, pulse,
    /** th: line angle (rad, + toward +x); on: 0..1; t: film time */
    update({ th = 0, on = 1, t = 0 }) {
      const R = DIM.cy, ax = R * Math.sin(th), ay = DIM.cy - R * Math.cos(th);   // the line's point on the lens face
      line.position.set(ax, ay, 0.0); line.rotation.z = th; line.scale.set(1, len / Math.cos(th), 1);
      red.opacity = on;
      // one pulse every 0.9 s of film time, crossing the block in 0.6 s
      const u = (t % 0.9) / 0.6;
      pulse.visible = on > 0 && u < 1;
      const r = 0.004 + u * len;
      pulse.position.set(ax - Math.sin(th) * R, ay + Math.cos(th) * R, 0);
      pulse.scale.setScalar(R + r); pulse.rotation.z = th;
      pulseMat.opacity = on * (1 - u) * 0.9;
      pulse.material.color.setRGB(1, 0.7, 0.66);
      pulse.scale.z = 1;
    },
  };
}
