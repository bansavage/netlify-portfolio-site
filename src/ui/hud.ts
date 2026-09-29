import { $, $$ } from './dom';

export interface Hud {
  /** Called every frame by the scene; throttled here to 10 updates a second. */
  telemetry: (dist: number, vel: number) => void;
}

export function initHud(reduce: boolean): Hud {
  const hNode = $('#h-node');
  const hDepth = $('#h-depth');
  const hVel = $('#h-vel');
  const hClock = $('#h-clock');
  const nav = $$<HTMLAnchorElement>('.nav a');
  const nodes = $$('.node');

  // Status bar and nav follow whichever node or transit is in the middle of the screen.
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const t = e.target as HTMLElement;
        if (hNode) hNode.textContent = `Node ${t.dataset.node ?? ''}`;
        nav.forEach((a) => a.classList.toggle('is-on', a.getAttribute('href') === `#${t.id}`));
      }
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  [...nodes, ...$$('.transit')].forEach((n) => io.observe(n));

  const et = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const tickClock = () => {
    if (hClock) hClock.textContent = `NYC·MIA ${et.format(new Date())} ET`;
  };
  tickClock();
  window.setInterval(tickClock, 1000);

  // 0–4 jump between nodes.
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const n = Number.parseInt(e.key, 10);
    if (n >= 0 && n < nodes.length) nodes[n].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  });

  let last = 0;
  return {
    telemetry(dist, vel) {
      const now = performance.now();
      if (now - last < 100) return;
      last = now;
      if (hDepth) hDepth.textContent = `Depth ${dist.toFixed(1).padStart(7, '0')}`;
      if (hVel) hVel.textContent = `Vel ${Math.abs(vel).toFixed(1).padStart(5, '0')}`;
    },
  };
}
