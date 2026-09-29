import * as THREE from 'three';
import { pick, type Rng } from './rng';
import { CODE, DATA, WORDS } from './vocab';

export const MONO = '"Share Tech Mono", "Courier New", monospace';

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  return [c, g];
}

const hex = (r: Rng, n: number) => Array.from({ length: n }, () => '0123456789ABCDEF'[(r() * 16) | 0]).join('');
const bin = (r: Rng, n: number) => Array.from({ length: n }, () => (r() < 0.5 ? '0' : '1')).join('');

function repeating(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A 512×1024 sheet of glowing readouts: boxed headers, hex dumps, code, binary and gauges. */
export function dataTexture(variant: number, r: Rng): THREE.CanvasTexture {
  const W = 512;
  const H = 1024;
  const [c, g] = canvas2d(W, H);
  g.fillStyle = 'rgba(40,130,200,0.025)';
  g.fillRect(0, 0, W, H);
  g.textBaseline = 'top';

  const line = () => {
    const k = r();
    if (k < 0.4) return pick(r, DATA);
    if (k < 0.7) return `${pick(r, WORDS)} ${hex(r, 4)}`;
    return `${(r() * 99999).toFixed(2).padStart(9, ' ')}  ${pick(r, ['OK', 'ACK', '200', '201', 'SYNC', `Q${(r() * 9) | 0}`])}`;
  };

  const cols: [number, number][] = variant % 2 === 0 ? [[16, 232], [264, 232]] : [[16, 480]];
  for (const [x0, cw] of cols) {
    let y = 10 + r() * 40;
    while (y < H - 30) {
      const kind = r();
      const a = 0.4 + r() * 0.6;
      g.globalAlpha = a;
      g.fillStyle = '#fff';
      g.strokeStyle = '#fff';
      if (kind < 0.28) {
        const word = pick(r, WORDS);
        g.font = `bold 22px ${MONO}`;
        const tw = g.measureText(word).width;
        g.lineWidth = 2;
        g.strokeRect(x0, y, Math.min(cw, tw + 16), 30);
        g.fillText(word, x0 + 8, y + 5);
        y += 38;
        g.font = `18px ${MONO}`;
        const n = 2 + ((r() * 4) | 0);
        for (let i = 0; i < n; i++) {
          g.globalAlpha = a * (0.55 + r() * 0.45);
          g.fillText(line(), x0, y);
          y += 22;
        }
        y += 12;
      } else if (kind < 0.48) {
        g.font = `17px ${MONO}`;
        const n = 3 + ((r() * 6) | 0);
        for (let i = 0; i < n; i++) {
          g.fillText(`${hex(r, 4)}  ${hex(r, 8)}${cw > 300 ? `  ${hex(r, 8)}  ${hex(r, 8)}` : ''}`, x0, y);
          y += 20;
        }
        y += 12;
      } else if (kind < 0.64) {
        g.font = `17px ${MONO}`;
        const n = 2 + ((r() * 3) | 0);
        for (let i = 0; i < n; i++) {
          g.fillText(pick(r, CODE).slice(0, Math.floor(cw / 9.2)), x0, y);
          y += 21;
        }
        y += 12;
      } else if (kind < 0.8) {
        g.font = `bold 20px ${MONO}`;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x0 + 13, y + 2);
        g.lineTo(x0, y + 11);
        g.lineTo(x0 + 13, y + 20);
        g.closePath();
        g.stroke();
        g.fillText(pick(r, WORDS), x0 + 22, y);
        y += 26;
        g.font = `17px ${MONO}`;
        g.fillText(pick(r, DATA), x0 + 22, y);
        y += 32;
      } else if (kind < 0.9) {
        g.font = `16px ${MONO}`;
        const n = 2 + ((r() * 4) | 0);
        for (let i = 0; i < n; i++) {
          g.fillText(bin(r, cw > 300 ? 42 : 20), x0, y);
          y += 19;
        }
        y += 12;
      } else {
        const n = 2 + ((r() * 3) | 0);
        for (let i = 0; i < n; i++) {
          const bw = (cw - 24) * (0.15 + r() * 0.85);
          g.fillRect(x0, y + 4, bw, 10);
          g.globalAlpha = a * 0.3;
          g.fillRect(x0 + bw + 4, y + 4, Math.max(0, cw - 28 - bw), 10);
          g.globalAlpha = a;
          y += 20;
        }
        y += 12;
      }
    }
  }
  g.globalAlpha = 1;
  return repeating(c);
}

/**
 * The motherboard floor. Channels are data, not colour:
 * r = trace mask, g = use the second colour, b = carries light pulses.
 */
export function circuitTexture(r: Rng): THREE.CanvasTexture {
  const S = 1024;
  const [c, g] = canvas2d(S, S);
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.lineCap = 'square';
  g.lineJoin = 'miter';
  const A_PULSE = 'rgb(255,0,255)';
  const A = 'rgb(255,0,0)';
  const B_PULSE = 'rgb(255,255,255)';
  const B = 'rgb(255,255,0)';

  const stroke = (pts: [number, number][], col: string, w: number) => {
    g.strokeStyle = col;
    g.shadowColor = col;
    g.shadowBlur = 7;
    g.lineWidth = w;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  };
  const pad = (x: number, y: number, col: string) => {
    g.fillStyle = col;
    g.shadowColor = col;
    g.shadowBlur = 8;
    g.fillRect(x - 4, y - 4, 8, 8);
  };

  const cx = S / 2;
  // Main bus down the middle of the corridor. Straight at both ends so it tiles.
  for (let i = 0; i < 7; i++) {
    const o = (i - 3) * 10;
    stroke([[cx + o, -12], [cx + o, 270], [cx + o + 34, 304], [cx + o + 34, 700], [cx + o, 734], [cx + o, S + 12]], i % 3 === 0 ? A_PULSE : A, 2.4);
  }
  // Branch buses that peel off toward the towers with a 45° bend.
  for (let k = 0; k < 22; k++) {
    const side = k % 2 ? 1 : -1;
    const n = 2 + ((r() * 4) | 0);
    const y0 = 30 + r() * (S - 260);
    const len = 50 + r() * 180;
    const xs = cx + side * (58 + r() * 16);
    const xo = cx + side * (140 + r() * 360);
    const second = r() < 0.42;
    const pulse = r() < 0.55;
    const col = second ? (pulse ? B_PULSE : B) : pulse ? A_PULSE : A;
    for (let i = 0; i < n; i++) {
      const o = i * 9;
      const x1 = xs + side * o;
      const yt = y0 + len - o;
      stroke([[x1, y0], [x1, yt], [x1 + side * 28, yt + 28], [xo, yt + 28]], col, 2);
      pad(x1, y0, col);
      pad(xo, yt + 28, col);
    }
  }
  // Short stubs out under the towers.
  for (let k = 0; k < 60; k++) {
    const x = r() < 0.5 ? 60 + r() * 300 : S - 60 - r() * 300;
    const y = 20 + r() * (S - 40);
    const l = 20 + r() * 90;
    const horiz = r() < 0.5;
    const col = r() < 0.5 ? A : B;
    g.globalAlpha = 0.5 + r() * 0.5;
    stroke(horiz ? [[x, y], [x + l, y]] : [[x, y], [x, y + l]], col, 1.6);
    pad(horiz ? x + l : x, horiz ? y : y + l, col);
    g.globalAlpha = 1;
  }
  // Two cross buses that jump over the main bus.
  for (let k = 0; k < 2; k++) {
    const y = 180 + k * 520 + r() * 60;
    for (let i = 0; i < 3; i++) {
      const yi = y + i * 9;
      stroke([[cx - 420, yi], [cx - 90, yi], [cx - 60, yi + 30], [cx + 60, yi + 30], [cx + 90, yi], [cx + 420, yi]], B, 1.8);
    }
  }
  return repeating(c);
}

/** A chip package face: outline, pin-1 dot, part number and serials. */
export function labelTexture(label: string, sub: string, r: Rng, anisotropy: number): THREE.CanvasTexture {
  const [c, g] = canvas2d(512, 512);
  g.fillStyle = 'rgba(40,130,200,0.04)';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = g.fillStyle = '#fff';
  g.textBaseline = 'top';
  g.globalAlpha = 0.85;
  g.lineWidth = 6;
  g.strokeRect(22, 22, 468, 468);
  g.beginPath();
  g.arc(78, 78, 18, 0, Math.PI * 2);
  g.stroke();
  g.font = `bold 66px ${MONO}`;
  g.fillText(label, 56, 170);
  g.globalAlpha = 0.6;
  g.font = `32px ${MONO}`;
  g.fillText(sub, 58, 262);
  g.globalAlpha = 0.4;
  g.font = `26px ${MONO}`;
  for (let i = 0; i < 3; i++) g.fillText(hex(r, 16), 58, 330 + i * 40);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = anisotropy;
  return t;
}

/** Electrolytic capacitor sleeve: polarity stripe plus rating. */
export function capacitorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas2d(256, 256);
  g.fillStyle = 'rgba(120,90,255,0.06)';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#fff';
  g.globalAlpha = 0.75;
  g.fillRect(0, 0, 40, 256);
  g.globalAlpha = 0.8;
  g.font = `bold 30px ${MONO}`;
  g.textBaseline = 'top';
  g.fillText('470uF', 64, 90);
  g.globalAlpha = 0.5;
  g.fillText('16V', 64, 130);
  return new THREE.CanvasTexture(c);
}

/** Soft radial light for the far end of the corridor. */
export function glowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas2d(256, 256);
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(160,245,255,0.75)');
  grd.addColorStop(0.5, 'rgba(61,160,255,0.22)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
