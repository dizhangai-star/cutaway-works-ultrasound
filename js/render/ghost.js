// Ghost mode (generic): every mesh not kept swaps to one shared see-through material, a fresnel rim in the
// theme's ink, so the parts that matter (here the beam's) read against film-base ghosts of the rest.

import * as THREE from 'three';

export function createGhost(root, keep) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(0xd8e6ee) }, uA: { value: 0 } },
    vertexShader: /* glsl */`
      #include <common>
      #include <clipping_planes_pars_vertex>
      varying vec3 vN; varying vec3 vV;
      void main() {
        #include <begin_vertex>
        #include <project_vertex>
        #include <clipping_planes_vertex>
        vN = normalize(normalMatrix * normal); vV = normalize(-mvPosition.xyz);
      }`,
    fragmentShader: /* glsl */`
      #include <clipping_planes_pars_fragment>
      uniform vec3 uCol; uniform float uA; varying vec3 vN; varying vec3 vV;
      void main() {
        #include <clipping_planes_fragment>
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        gl_FragColor = vec4(uCol, uA * (0.03 + 0.34 * f * f * f));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, clipping: true, clipIntersection: true,   // the cut = the region every plane clips
  });
  mat.userData.ghost = true;                     // drawings still draw these parts (they skip only real transparents)
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh || keep(o)) return;
    if (o.material.transparent) o.userData.noDrawing = true;   // the drawings never showed it; keep it so while ghosted
    meshes.push({ o, m: o.material, shadow: o.castShadow });
  });
  // parts whose own materials are never shared with a kept part can dissolve out before the swap (hook materials)
  const kept = new Set(); root.traverse((o) => { if (o.isMesh && keep(o)) kept.add(o.material); });
  const fade = [...new Set(meshes.map((r) => r.m))].filter((m) => !kept.has(m) && m.userData.dis);
  let on = false;
  return {
    material: mat,
    /** a = 0..1 ghost strength; 0 restores the real materials. out = 0..1 dissolves the real parts (while a = 0):
     *  entering, dissolve them out and then fade the ghosts in; leaving, the reverse */
    set(a, { color, planes, out = 0 } = {}) {
      for (const m of fade) m.userData.dis.value = a > 0.001 ? 0 : out;
      if (color) mat.uniforms.uCol.value.set(color);
      mat.clippingPlanes = planes || null;
      mat.uniforms.uA.value = a;
      const want = a > 0.001;
      if (want === on) return;
      on = want;
      for (const r of meshes) { r.o.material = on ? mat : r.m; r.o.castShadow = on ? false : r.shadow; }
    },
  };
}
