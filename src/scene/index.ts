import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { buildCity, CITY_LENGTH } from './city';
import { createFloor } from './floor';
import { createKit, type Part } from './hardware';
import { createPackets } from './packets';
import { createRig } from './rig';
import { mulberry32 } from './rng';
import { circuitTexture, dataTexture, glowTexture } from './textures';

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  /** Phones and touch devices: fewer towers, no reflections, lower resolution. */
  small: boolean;
  reduce: boolean;
  onTelemetry?: (dist: number, vel: number) => void;
}

const VOID = 0x02030a;
const FOG = 0.005;

/** Builds the data city and starts rendering. Returns a function that stops it. */
export function startScene({ canvas, small, reduce, onTelemetry }: SceneOptions): () => void {
  // The look was tuned without colour management (additive glow in display space). Keep it that way.
  THREE.ColorManagement.enabled = false;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.75));
  renderer.setClearColor(VOID, 1);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(VOID, FOG);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  camera.rotation.order = 'YXZ';

  const rand = mulberry32(1047);
  const texes = [0, 1, 2, 3, 4, 5].map((i) => {
    const t = dataTexture(i, mulberry32(90 + i));
    t.anisotropy = Math.min(4, anisotropy);
    return t;
  });

  const parts: Part[] = [];
  const kit = createKit({ scene, rand, reflect: !small, parts, texes, anisotropy });
  buildCity(kit, rand, small);

  const circuit = circuitTexture(mulberry32(7));
  circuit.anisotropy = anisotropy;
  const floor = createFloor(circuit, FOG);
  scene.add(floor.mesh);

  const packets = createPackets(scene, rand, small ? 40 : 90);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: 0xaff7ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.38 }),
  );
  glow.scale.set(110, 70, 1);
  glow.renderOrder = 3;
  scene.add(glow);

  let composer: EffectComposer | null = null;
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), small ? 0.6 : 0.8, 0.45, 0.32));
    composer.addPass(new OutputPass());
  } catch (err) {
    console.warn('Bloom disabled:', err);
    composer = null;
  }

  const resize = () => {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer?.setSize(w, h);
  };
  resize();
  addEventListener('resize', resize);

  const rig = createRig(camera, reduce);
  let last = performance.now();
  let raf = 0;

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const { z, dist, vel } = rig.update(now, dt);

    for (const p of parts) {
      if (p.obj.position.z - p.d > z + 12) p.obj.position.z -= CITY_LENGTH;
      if (p.flow && p.tex) p.tex.offset.y += p.flow * dt;
    }
    floor.mesh.position.z = z - 420;
    floor.material.uniforms.uTime.value = (now / 1000) * (reduce ? 0.3 : 1);
    packets.update(z, dt, reduce);
    glow.position.set(0, 16, z - 330);

    if (composer) composer.render();
    else renderer.render(scene, camera);

    onTelemetry?.(dist, vel);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    removeEventListener('resize', resize);
    rig.dispose();
    composer?.dispose();
    renderer.dispose();
  };
}
