import * as THREE from 'three';
import type { Rng } from './rng';

interface Packet {
  ground: boolean;
  x: number;
  y: number;
  z: number;
  v: number;
  len: number;
}

const COLORS = [0x7ff6ff, 0xff5ad8, 0xffb46b, 0xffffff].map((c) => new THREE.Color(c));

/** Streaks of light: along the floor bus racing away, and overhead rushing past the camera. */
export function createPackets(scene: THREE.Scene, rand: Rng, count: number) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.07, 0.07, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    count,
  );
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;

  const spawn = (p: Packet, z0: number, fresh: boolean) => {
    p.ground = rand() < 0.55;
    p.x = p.ground ? ((((rand() * 7) | 0) - 3) * 10) / 6.4 : -8 + rand() * 16;
    p.y = p.ground ? 0.1 : 2 + rand() * 30;
    p.v = p.ground ? -(30 + rand() * 40) : 18 + rand() * 45;
    p.len = p.ground ? 2 + rand() * 4 : 3 + rand() * 8;
    p.z = fresh ? z0 - rand() * 380 : p.v < 0 ? z0 + 4 - rand() * 10 : z0 - 360 - rand() * 60;
  };

  const packets: Packet[] = [];
  for (let i = 0; i < count; i++) {
    const p: Packet = { ground: false, x: 0, y: 0, z: 0, v: 0, len: 1 };
    spawn(p, 0, true);
    packets.push(p);
    mesh.setColorAt(i, COLORS[(rand() * COLORS.length) | 0]);
  }
  scene.add(mesh);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();

  return {
    update(cameraZ: number, dt: number, reduce: boolean): void {
      const k = reduce ? 0.2 : 1;
      for (let i = 0; i < count; i++) {
        const p = packets[i];
        p.z += p.v * dt * k;
        if (p.z > cameraZ + 6 || p.z < cameraZ - 440) spawn(p, cameraZ, false);
        pos.set(p.x, p.y, p.z);
        scale.set(1, 1, p.len);
        m4.compose(pos, q, scale);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
