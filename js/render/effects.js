// Beam effects: electrons cathode → focal track, the focal-spot glow, the X-ray cone with its heel gradient.
// Everything deterministic in film time (particles are a function of t), so seek() gives the same frame.

import * as THREE from 'three';
import { DIM } from '../build/tube.js';

const HALF = Math.atan(0.215);                 // coverage 430 × 430 mm at 1 m → 12.1° half angle (SOURCES S1)

export function createEffects(scene) {
  const g = new THREE.Group(); g.name = 'effects'; scene.add(g);
  const u = { uT: { value: 0 }, uOn: { value: 0 }, uLight: { value: 0 } };

  // ── electrons: N particles on focusing paths, each a function of (seed, t) ──
  const N = 900;
  const seed = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = Math.random(); }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
  eg.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 3));
  const a = DIM.cathode.clone().add(new THREE.Vector3(0.0004, 0, -0.0032)), b = DIM.spot.clone().add(new THREE.Vector3(-0.0005, 0, 0));
  const eMat = new THREE.ShaderMaterial({
    uniforms: { ...u, uA: { value: a }, uB: { value: b }, uSize: { value: 3.4 } },
    vertexShader: /* glsl */`
      attribute vec3 seed; uniform float uT, uOn; uniform vec3 uA, uB; uniform float uSize; varying float vA;
      void main() {
        float s = fract(seed.x + uT * (2.6 + seed.z * 0.6));          // progress cathode → track
        float ang = seed.y * 6.2831853;
        float spread = 0.0034 * (1.0 - s) * (1.0 - s) + 0.0006;        // focusing cup squeezes the cloud
        vec3 p = mix(uA, uB, s);
        p.y += cos(ang) * spread * 0.7; p.z += sin(ang) * spread * 1.6;
        vA = uOn * smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.9, 1.0, s));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.6 + seed.z) * (0.35 / -mv.z) * 3.0;
      }`,
    fragmentShader: /* glsl */`
      varying float vA; uniform float uLight;
      void main() { float d = length(gl_PointCoord - 0.5); float k = smoothstep(0.5, 0.0, d);
        vec3 c = mix(vec3(0.55, 0.85, 1.0), vec3(0.1, 0.35, 0.7), uLight);
        gl_FragColor = vec4(c * k * vA * 1.4, k * vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const electrons = new THREE.Points(eg, eMat); electrons.frustumCulled = false; g.add(electrons);

  // a faint core between cup and spot
  const coreLen = a.distanceTo(b);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0016, coreLen, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x7fc6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.position.copy(a).add(b).multiplyScalar(0.5); core.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.add(core);

  // ── focal spot glow (sprite) ──
  const spot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffc27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0 }));
  spot.position.copy(DIM.spot).add(new THREE.Vector3(-0.001, -0.001, 0)); spot.scale.setScalar(0.03); g.add(spot);
  const spotCore = spot.clone(); spotCore.material = spot.material.clone(); spotCore.material.color.set(0xfff4e0); spotCore.scale.setScalar(0.009); g.add(spotCore);

  // ── X-ray cone: apex at the spot, straight down, heel side (+x, toward the anode) dimmer ──
  const L = DIM.spot.y - DIM.floor + 0.002;
  const coneG = new THREE.ConeGeometry(L * Math.tan(HALF), L, 64, 24, true);
  coneG.translate(0, -L / 2, 0);                          // apex at origin, opening downward
  const coneM = new THREE.ShaderMaterial({
    uniforms: { ...u, uL: { value: L } },
    vertexShader: /* glsl */`
      varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main() { vP = position; vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform float uOn, uL, uT, uLight; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main() {
        float depth = clamp(-vP.y / uL, 0.0, 1.0);
        float r = length(vP.xz) / max(depth * uL * 0.2144, 1e-4);   // 0 centre … 1 edge
        float body = pow(abs(dot(normalize(vN), vV)), 1.6);
        float heel = mix(1.0, 0.35, smoothstep(-0.2, 1.0, vP.x / max(depth * uL * 0.2144, 1e-4)));
        float fade = smoothstep(0.0, 0.08, depth) * (1.0 - 0.45 * depth);
        float flick = 0.92 + 0.08 * sin(uT * 60.0 + vP.y * 400.0);
        float a = uOn * (0.3 + body) * heel * fade * flick * 1.35;
        vec3 c = mix(vec3(0.72, 0.88, 1.0), vec3(0.25, 0.45, 0.75), uLight);
        gl_FragColor = vec4(c * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(coneG, coneM); cone.position.copy(DIM.spot); g.add(cone);
  // glow where the beam leaves the window
  const winGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xbfe0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  winGlow.position.set(0, -0.093, 0); winGlow.scale.set(0.05, 0.03, 1); g.add(winGlow);
  // where the beam lands on the film base
  const pool = new THREE.Mesh(new THREE.CircleGeometry(L * Math.tan(HALF) * 1.25, 64), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0x9fd0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, DIM.floor + 0.001, 0); g.add(pool);

  // ── the long beam (Image view): collimated to the detector field, spot → detector, heel side dimmer ──
  const longG = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 16, true);
  longG.rotateY(Math.PI / 4); longG.translate(0, -0.5, 0);           // apex at origin, a unit square base at y = −1
  const longM = coneM.clone();
  longM.uniforms = { ...u, uL: { value: 1 } };
  longM.fragmentShader = /* glsl */`
      uniform float uOn, uT, uLight; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main() {
        float depth = clamp(-vP.y, 0.0, 1.0);
        float body = pow(abs(dot(normalize(vN), vV)), 1.4);
        float heel = mix(1.0, 0.45, smoothstep(-0.6, 0.6, vP.x / max(depth, 1e-4)));
        float fade = smoothstep(0.0, 0.05, depth) * (1.0 - 0.35 * depth);
        float flick = 0.94 + 0.06 * sin(uT * 60.0 + vP.y * 90.0);
        float a = uOn * (0.22 + 0.8 * body) * heel * fade * flick * 0.55;
        vec3 c = mix(vec3(0.72, 0.88, 1.0), vec3(0.25, 0.45, 0.75), uLight);
        gl_FragColor = vec4(c * a, a);
      }`;
  const longBeam = new THREE.Mesh(longG, longM); longBeam.position.copy(DIM.spot); longBeam.visible = false; g.add(longBeam);

  return {
    group: g,
    /** the Image view's beam: SID and field (m), the field's long side along X */
    setLong(on, { sid = 1.8, fu = 0.35, fv = 0.43 } = {}) {
      longBeam.visible = on; longBeam.scale.set(fv, sid, fu);
      cone.visible = pool.visible = !on;
    },
    /** beam 0..1, filament 0..1, t seconds (film time), light theme flag */
    update({ beam, t, light, open = true }) {      // open: the housing is cut, so the inside (electrons, spot) can show
      u.uT.value = t; u.uOn.value = beam; u.uLight.value = light ? 1 : 0;
      core.material.opacity = 0.6 * beam;
      spot.material.opacity = 0.9 * beam; spotCore.material.opacity = beam;
      spot.scale.setScalar(0.042 + 0.005 * Math.sin(t * 37)); spotCore.scale.setScalar(0.014);
      pool.material.opacity = 0.85 * beam; winGlow.material.opacity = 0.75 * beam;
      g.visible = beam > 0.001;
      electrons.visible = core.visible = spot.visible = spotCore.visible = open;
    },
  };
}

let _glow;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c); _glow.colorSpace = THREE.SRGBColorSpace; return _glow;
}
