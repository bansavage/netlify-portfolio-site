import { $$ } from './dom';

const GLYPHS = '!<>-_\\/[]{}=+*^?#01ABCDEF$%';

/** Decodes text from random glyphs into its real value, left to right. */
function scramble(el: HTMLElement, frames = 22): void {
  if (el.dataset.done) return;
  el.dataset.done = '1';
  const final = el.textContent ?? '';
  el.setAttribute('aria-label', final);
  const chars = [...final];
  let f = 0;
  const tick = (): void => {
    const k = f / frames;
    el.textContent = chars
      .map((ch, i) => (ch === ' ' || i / chars.length < k ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
      .join('');
    if (++f <= frames) requestAnimationFrame(tick);
    else el.textContent = final;
  };
  tick();
}

/** When a node panel scrolls into view: decode its headings and replay its terminal logs. */
export function initReveal(reduce: boolean): void {
  if (reduce) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const node = e.target as HTMLElement;
        io.unobserve(node);
        $$('[data-scramble]', node).forEach((h) => scramble(h));
        $$('[data-scramble-soft]', node).forEach((n, i) => window.setTimeout(() => scramble(n, 14), i * 40));
        $$('[data-play]', node).forEach((p) => p.classList.add('play'));
      }
    },
    { threshold: 0.35 },
  );
  $$('.node').slice(1).forEach((n) => io.observe(n));
}
