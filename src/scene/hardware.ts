import * as THREE from 'three';
import { mulberry32, type Rng } from './rng';
import { capacitorTexture, labelTexture } from './textures';
import { CHIP_LABELS } from './vocab';

/** Anything in the city that scrolls past and gets recycled to the far end. */
export interface Part {
  obj: THREE.Object3D;
  /** Depth along the corridor, used to decide when it is behind the camera. */
  d: number;
  /** Texture scroll speed for towers with streaming data, 0 for static. */
  flow: number;
  tex?: THREE.Texture;
}

export interface KitContext {
  scene: THREE.Scene;
  rand: Rng;
  reflect: boolean;
  parts: Part[];
  texes: THREE.Texture[];
  anisotropy: number;
}

/** [centerX, centerY, centerZ, width, height, depth] */
type Box = [number, number, number, number, number, number];

const EDGE_IDX: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7],
];

/** Outline many boxes as one LineSegments geometry, so fins and pins cost one draw call. */
function boxEdges(boxes: Box[]): THREE.BufferGeometry {
  const pts: number[] = [];
  for (const [cx, cy, cz, w, h, d] of boxes) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    for (const [a, b] of EDGE_IDX) pts.push(...v[a], ...v[b]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

const glass = (map: THREE.Texture | null, color: number, opacity: number) =>
  new THREE.MeshBasicMaterial({
    map,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

const TOWER_PALETTES = [
  { text: 0x46ecff, edge: 0x8ff8ff, weight: 0.6 },
  { text: 0xffa24a, edge: 0xa06bff, weight: 0.24 },
  { text: 0xbfe6ff, edge: 0x4fa8ff, weight: 0.16 },
];

export type Kit = ReturnType<typeof createKit>;

export function createKit(ctx: KitContext) {
  const { scene, rand, reflect, parts, texes, anisotropy } = ctx;

  const edgeMats = new Map<string, THREE.LineBasicMaterial>();
  const edgeMat = (color: number, opacity: number) => {
    const key = `${color}:${opacity}`;
    let m = edgeMats.get(key);
    if (!m) {
      m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
      edgeMats.set(key, m);
    }
    return m;
  };

  const chipMats = CHIP_LABELS.map(([label, sub], i) =>
    glass(labelTexture(label, sub, mulberry32(300 + i), Math.min(4, anisotropy)), i % 3 === 1 ? 0xffa24a : 0x7ff0ff, 0.6),
  );
  const capMat = glass(capacitorTexture(), 0xc2a4ff, 0.55);
  const ramTex = texes[3].clone();
  ramTex.needsUpdate = true;
  ramTex.repeat.set(1.2, 0.35);
  const ramMat = glass(ramTex, 0x9ff4ff, 0.5);

  const pickPalette = () => {
    let x = rand();
    for (const p of TOWER_PALETTES) if ((x -= p.weight) <= 0) return p;
    return TOWER_PALETTES[0];
  };

  /** Mirror the group under the floor (the floor is 86% opaque, so it reads as a faint reflection). */
  function place(grp: THREE.Group, x: number, z: number, d: number, flow = 0, tex?: THREE.Texture): void {
    if (reflect) {
      const mirror = grp.clone();
      mirror.scale.y = -1;
      mirror.traverse((o) => { o.renderOrder = 0; });
      grp.add(mirror);
    }
    grp.position.set(x, 0, z);
    scene.add(grp);
    parts.push({ obj: grp, d, flow, tex });
  }

  /** Glass data tower. */
  function tower(x: number, z: number, w: number, d: number, h: number): void {
    const pal = pickPalette();
    const geo = new THREE.BoxGeometry(w, h, d);
    const tex = texes[(rand() * texes.length) | 0].clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(w / 10)), h / 22);
    tex.offset.set(rand(), rand());
    const grp = new THREE.Group();
    const body = new THREE.Mesh(geo, glass(tex, pal.text, 0.55));
    body.position.y = h / 2;
    body.renderOrder = 2;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat(pal.edge, 0.65));
    edge.position.y = h / 2;
    edge.renderOrder = 2;
    grp.add(body, edge);
    const flow = rand() < 0.35 ? (0.015 + rand() * 0.06) * (rand() < 0.5 ? -1 : 1) : 0;
    place(grp, x, z, d, flow, tex);
  }

  /** Surface-mount chip with gull-wing pins; square ones get pins on all four sides. */
  function chip(x: number, z: number, w: number, d: number, h: number, color: number): void {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), chipMats[(rand() * chipMats.length) | 0]);
    body.position.y = 0.25 + h / 2;
    body.renderOrder = 2;
    const boxes: Box[] = [[0, 0.25 + h / 2, 0, w, h, d]];
    const pitch = 0.55;
    const nz = Math.max(2, Math.floor((d - 0.5) / pitch));
    const nx = Math.max(2, Math.floor((w - 0.5) / pitch));
    for (let i = 0; i < nz; i++) {
      const pz = -d / 2 + 0.25 + (i + 0.5) * ((d - 0.5) / nz);
      boxes.push([-w / 2 - 0.28, 0.2, pz, 0.56, 0.14, 0.2], [w / 2 + 0.28, 0.2, pz, 0.56, 0.14, 0.2]);
    }
    if (Math.abs(w - d) < 1.2) {
      for (let i = 0; i < nx; i++) {
        const px = -w / 2 + 0.25 + (i + 0.5) * ((w - 0.5) / nx);
        boxes.push([px, 0.2, -d / 2 - 0.28, 0.2, 0.14, 0.56], [px, 0.2, d / 2 + 0.28, 0.2, 0.14, 0.56]);
      }
    }
    const edge = new THREE.LineSegments(boxEdges(boxes), edgeMat(color, 0.75));
    edge.renderOrder = 2;
    grp.add(body, edge);
    place(grp, x, z - d / 2, d + 1);
  }

  /** Electrolytic capacitor with the vent cross on top. */
  function capacitor(x: number, z: number, r: number, h: number): void {
    const grp = new THREE.Group();
    const geo = new THREE.CylinderGeometry(r, r, h, 20, 1, false);
    const body = new THREE.Mesh(geo, capMat);
    body.position.y = h / 2;
    body.renderOrder = 2;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat(0xb08cff, 0.8));
    edge.position.y = h / 2;
    edge.renderOrder = 2;
    const ventGeo = new THREE.BufferGeometry();
    ventGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      -r * 0.7, h + 0.01, 0, r * 0.7, h + 0.01, 0,
      0, h + 0.01, -r * 0.7, 0, h + 0.01, r * 0.7,
    ], 3));
    const vent = new THREE.LineSegments(ventGeo, edgeMat(0xb08cff, 0.8));
    vent.renderOrder = 2;
    grp.add(body, edge, vent);
    place(grp, x, z, r * 2);
  }

  /** A bank of RAM sticks standing across the corridor, with chips and gold contacts. */
  function ramBank(x: number, z: number, n: number): void {
    const grp = new THREE.Group();
    const len = 12, hh = 7.5, th = 0.4, gap = 1.8;
    const geo = new THREE.BoxGeometry(len, hh, th);
    const boxes: Box[] = [];
    const gold: Box[] = [];
    for (let i = 0; i < n; i++) {
      const sz = (i - (n - 1) / 2) * gap;
      const stick = new THREE.Mesh(geo, ramMat);
      stick.position.set(0, 0.7 + hh / 2, sz);
      stick.renderOrder = 2;
      grp.add(stick);
      boxes.push([0, 0.7 + hh / 2, sz, len, hh, th], [0, 0.35, sz, len + 1, 0.7, th + 0.5]);
      for (let j = 0; j < 4; j++) boxes.push([-len / 2 + 1.7 + j * 2.9, 0.7 + hh * 0.58, sz + th / 2 + 0.12, 2.2, 2.4, 0.24]);
      gold.push([0, 0.95, sz, len - 1, 0.35, th + 0.06]);
    }
    const edge = new THREE.LineSegments(boxEdges(boxes), edgeMat(0x8ff8ff, 0.7));
    edge.renderOrder = 2;
    const contacts = new THREE.LineSegments(boxEdges(gold), edgeMat(0xffa24a, 0.9));
    contacts.renderOrder = 2;
    grp.add(edge, contacts);
    place(grp, x, z - (n * gap) / 2, n * gap + 1);
  }

  /** CPU package with a finned heat sink on top. */
  function cpu(x: number, z: number, s: number): void {
    const grp = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(s, 1.4, s), chipMats[0]);
    base.position.y = 0.7;
    base.renderOrder = 2;
    const fh = 4 + rand() * 4;
    const nf = 11;
    const fw = s * 0.84;
    const volume = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, fw), glass(null, 0x3a8fff, 0.07));
    volume.position.y = 1.4 + fh / 2;
    volume.renderOrder = 2;
    const fins: Box[] = [];
    for (let i = 0; i < nf; i++) fins.push([-fw / 2 + (i + 0.5) * (fw / nf), 1.4 + fh / 2, 0, 0.16, fh, fw]);
    const baseEdge = new THREE.LineSegments(boxEdges([[0, 0.7, 0, s, 1.4, s]]), edgeMat(0xffa24a, 0.85));
    baseEdge.renderOrder = 2;
    const finEdge = new THREE.LineSegments(boxEdges(fins), edgeMat(0x8ff8ff, 0.55));
    finEdge.renderOrder = 2;
    grp.add(base, volume, baseEdge, finEdge);
    place(grp, x, z - s / 2, s + 1);
  }

  return { tower, chip, capacitor, ramBank, cpu };
}
