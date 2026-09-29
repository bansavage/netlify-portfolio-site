import type { Kit } from './hardware';
import type { Rng } from './rng';

/** Everything is laid out over this stretch of corridor and recycled forward as the camera passes. */
export const CITY_LENGTH = 440;

export function buildCity(kit: Kit, rand: Rng, small: boolean): void {
  const L = CITY_LENGTH;

  for (const side of [-1, 1]) {
    // Inner row: towers mixed with CPU blocks and RAM banks. One of each is forced
    // into the first few slots so the board reads immediately.
    let z = -rand() * 6;
    let k = 0;
    while (z > -L) {
      const roll = rand();
      const forceCpu = side === 1 && k === 1;
      const forceRam = side === -1 && k === 2;
      if (forceCpu || (!forceRam && roll < 0.13)) {
        const s = 9 + rand() * 3;
        kit.cpu(side * (11 + s / 2 + rand()), z, s);
        z -= s + 3 + rand() * 5;
      } else if (forceRam || roll < 0.27) {
        const n = 4 + ((rand() * 3) | 0);
        kit.ramBank(side * (17.5 + rand()), z, n);
        z -= n * 1.8 + 3 + rand() * 5;
      } else {
        const w = 6 + rand() * 6;
        const d = 6 + rand() * 8;
        const h = 16 + Math.pow(rand(), 1.6) * 72;
        kit.tower(side * (11 + w / 2 + rand() * 1.5), z - d / 2, w, d, h);
        z -= d + 3 + rand() * 6;
      }
      k++;
    }

    // Outer row: taller towers for the skyline. Skipped on phones.
    if (!small) {
      z = -rand() * 14;
      while (z > -L) {
        const w = 10 + rand() * 14;
        const d = 10 + rand() * 14;
        const h = 40 + rand() * 110;
        kit.tower(side * (32 + rand() * 26 + w / 2), z - d / 2, w, d, h);
        z -= d + 6 + rand() * 12;
      }
    }
  }

  // Chips and capacitors on the corridor edges, below the camera.
  let zc = -6;
  while (zc > -L) {
    const side = rand() < 0.5 ? -1 : 1;
    if (rand() < 0.62) {
      const w = 2.4 + rand() * 2.4;
      const d = rand() < 0.4 ? w : 2.6 + rand() * 4;
      kit.chip(side * (6.3 + w / 2 + rand() * 1.1), zc, w, d, 0.55 + rand() * 0.5, rand() < 0.6 ? 0x8ff8ff : 0xffa24a);
      zc -= d + 5 + rand() * 11;
    } else {
      const n = 2 + ((rand() * 3) | 0);
      for (let i = 0; i < n; i++) kit.capacitor(side * (7.2 + rand() * 2.4), zc - i * 1.9, 0.5 + rand() * 0.35, 1.3 + rand() * 1.7);
      zc -= n * 1.9 + 5 + rand() * 10;
    }
  }
}
