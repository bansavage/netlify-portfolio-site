import type * as THREE from 'three';

const BASE_FOV = 62;
const EYE_HEIGHT = 5.2;

/**
 * Camera flight: a constant forward drift, extra distance from page scroll, mouse look,
 * a crane shot from above the board on load, and a FOV kick when scrolling fast.
 */
export function createRig(camera: THREE.PerspectiveCamera, reduce: boolean) {
  const look = { mx: 0, my: 0, yaw: 0, pitch: -0.06 };
  const onMove = (e: PointerEvent) => {
    look.mx = (e.clientX / innerWidth) * 2 - 1;
    look.my = (e.clientY / innerHeight) * 2 - 1;
  };
  addEventListener('pointermove', onMove, { passive: true });

  const startT = performance.now();
  const autoSpeed = reduce ? 0.8 : 7;
  const scrollK = reduce ? 0.12 : 0.4;
  let flight = 0;
  let smoothScroll = scrollY;
  let lastScroll = scrollY;
  let lastDist = 0;
  let vel = 0;
  let fov = BASE_FOV;

  function update(now: number, dt: number) {
    flight += autoSpeed * dt;
    smoothScroll += (scrollY - smoothScroll) * Math.min(1, dt * 4);
    const dist = flight + smoothScroll * scrollK;
    const z = -dist;
    const inst = dt > 0 ? (dist - lastDist) / dt : 0;
    lastDist = dist;
    vel += (inst - vel) * Math.min(1, dt * 3);

    // 1 at load (high above the board, looking down), easing to 0 at street level.
    let crane = 0;
    if (!reduce) {
      const byTime = Math.min(1, Math.max(0, ((now - startT) / 1000 - 0.5) / 3.8));
      const byScroll = Math.min(1, smoothScroll / (innerHeight * 0.75));
      const p = Math.max(byTime, byScroll);
      crane = 1 - p * p * (3 - 2 * p);
    }

    camera.position.set(
      Math.sin(now * 0.00021) * 1.2,
      EYE_HEIGHT + Math.sin(now * 0.0007) * 0.22 + crane * 44,
      z + crane * 14,
    );

    const k = Math.min(1, dt * 3);
    look.yaw += (-look.mx * 0.3 - look.yaw) * k;
    look.pitch += (-look.my * 0.12 - 0.06 - look.pitch) * k;
    camera.rotation.set(look.pitch - crane * 0.95, look.yaw * (1 - crane * 0.6), reduce ? 0 : Math.sin(dist * 0.02) * 0.02);

    if (!reduce) {
      const scrollSpeed = Math.abs(scrollY - lastScroll) / Math.max(dt, 0.001);
      fov += (BASE_FOV + Math.min(24, scrollSpeed * 0.012) - fov) * Math.min(1, dt * 5);
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    lastScroll = scrollY;

    return { z, dist, vel };
  }

  return {
    update,
    dispose: () => removeEventListener('pointermove', onMove),
  };
}
