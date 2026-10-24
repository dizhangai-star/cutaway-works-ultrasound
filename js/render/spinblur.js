// Motion blur for spinning parts (generic). The drawn spin is slowed so it reads (true 161.7 rev/s aliases at
// 60 fps), but the blur follows the TRUE speed: a feature smears once it travels more than about its own spacing
// during the shutter (half a frame at 60 fps). Each spinning material fades out while a transparent smear of the
// swept ring (opacity = the features' share of the ring) fades in.
//   entries: [{ mat, smear, n (features per turn), k (turns per rotor turn), cover }]

import * as THREE from 'three';

const SHUTTER = 1 / 120;

export function createSpinBlur(entries) {
  return {
    /** rpm = true rotor speed; returns the bar blur (0..1) for the readouts */
    set(rpm) {
      let out = 0;
      for (const e of entries) {
        const travel = (rpm / 60) * e.k * SHUTTER * e.n;             // feature spacings swept while the shutter is open
        const b = smooth(0.3, 1.5, travel);
        e.mat.opacity = 1 - b; e.mat.visible = b < 0.999; e.mat.depthWrite = b < 0.5;
        e.smear.opacity = e.cover * b; e.smear.visible = b > 0.001;
        out = Math.max(out, b);
      }
      return out;
    },
  };
}
const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

// Sweep blur (generic): true-speed motion blur for a group drawn at a slowed speed whose features move LESS than
// their own spacing while the shutter is open (a gantry drum: 9° at 182 rpm, ribs 22.5° apart), so a fade to a
// smear would be wrong. The scene is drawn k times with the group stepped back across the angle it sweeps at the
// true speed, into a linear half-float target, averaged, then tone-mapped and converted once onto the canvas.
//   const sb = createSweepBlur(renderer); sb.render(scene, camera, viewport, steps, (f) => pose(f))
//   f runs over (0, 1]: the trailing fraction of the sweep; pose(0) must restore the drawn pose.

export function createSweepBlur(renderer) {
  const rt = (samples) => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthBuffer: samples > 0 });
  const frame = rt(4), acc = rt(0);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = (mat) => { const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)); return s; };
  const vs = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  // add one sub-frame (premultiplied, linear) with weight w
  const add = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null }, w: { value: 1 } }, vertexShader: vs, toneMapped: false, depthTest: false, depthWrite: false,
    fragmentShader: 'uniform sampler2D tMap; uniform float w; varying vec2 vUv; void main() { gl_FragColor = texture2D(tMap, vUv) * w; }',
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
  });
  // the average onto the canvas: un-premultiply, tone map + output colour space (as a direct draw would), premultiply
  const out = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: acc.texture } }, vertexShader: vs, depthTest: false, depthWrite: false, premultipliedAlpha: true,
    fragmentShader: `uniform sampler2D tMap; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tMap, vUv); float a = clamp(c.a, 0.0, 1.0);
        gl_FragColor = vec4(a > 1e-4 ? c.rgb / c.a : vec3(0.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor = vec4(gl_FragColor.rgb * a, a);
      }`,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const addScene = quad(add), outScene = quad(out);
  const clear = new THREE.Color(), size = new THREE.Vector2();

  return {
    /** vp = { x, y, w, h } in canvas css px, GL origin (bottom-left); steps ≥ 2 */
    render(scene, camera, vp, steps, pose) {
      const dpr = renderer.getPixelRatio(), W = Math.max(1, Math.round(vp.w * dpr)), H = Math.max(1, Math.round(vp.h * dpr));
      renderer.getSize(size);
      if (frame.width !== W || frame.height !== H) { frame.setSize(W, H); acc.setSize(W, H); }
      const prevTarget = renderer.getRenderTarget(), prevAlpha = renderer.getClearAlpha(), autoShadow = renderer.shadowMap.autoUpdate;
      renderer.getClearColor(clear);
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(acc); renderer.clear();
      add.uniforms.tMap.value = frame.texture; add.uniforms.w.value = 1 / steps;
      for (let k = 0; k < steps; k++) {
        pose((k + 0.5) / steps);
        renderer.setRenderTarget(frame); renderer.clear(); renderer.render(scene, camera);
        renderer.shadowMap.autoUpdate = false;                       // shadows from the first sub-frame are enough under the blur
        renderer.setRenderTarget(acc); renderer.render(addScene, cam);
      }
      pose(0);
      renderer.shadowMap.autoUpdate = autoShadow;
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(clear, prevAlpha);
      renderer.setViewport(vp.x, vp.y, vp.w, vp.h); renderer.setScissor(vp.x, vp.y, vp.w, vp.h);
      renderer.render(outScene, cam);
    },
  };
}
