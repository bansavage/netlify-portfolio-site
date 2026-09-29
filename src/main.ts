import './styles.css';
import { runBoot } from './ui/boot';
import { initContact } from './ui/contact';
import { initHud } from './ui/hud';
import { initReveal } from './ui/reveal';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 760px), (pointer: coarse)').matches;

runBoot(reduce);
initReveal(reduce);
const hud = initHud(reduce);
initContact();

/** Tower textures are drawn with Share Tech Mono, so give the web font a moment to arrive. */
function fontsReady(): Promise<unknown> {
  if (!document.fonts?.load) return Promise.resolve();
  return Promise.race([
    document.fonts.load('17px "Share Tech Mono"').catch(() => undefined),
    new Promise((resolve) => window.setTimeout(resolve, 1200)),
  ]);
}

// The 3D scene (and three.js) loads as a separate chunk after the page content is up.
async function bootScene(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#gl');
  if (!canvas) return;
  try {
    await fontsReady();
    const { startScene } = await import('./scene');
    const stop = startScene({ canvas, small, reduce, onTelemetry: hud.telemetry });
    import.meta.hot?.dispose(stop);
  } catch (err) {
    document.documentElement.classList.add('no-gl');
    console.warn('WebGL disabled:', err);
  }
}

void bootScene();
