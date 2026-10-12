/* =================================================================================================
 * Kyle & Daina — Coming Soon · "Golden Hour Canopy"
 * main.js — the conductor: owns the clock, animates the HTML copy, and tells the scene which
 * moment to draw. The whole piece (intro + endless ambient loop) is a pure function of one
 * number, t = seconds since the start, so any frame can be reproduced with ?t=<seconds>.
 *
 * TIMELINE (seconds — every number lives in TL below; change one there and everything follows)
 *
 *   0.0        Fade up from deep green. The camera is already moving, deep inside the foliage.
 *   0.0 – 4.2  ACT 1 · The push. Camera dollies 13.5 units forward: quick through the leaves
 *              (they blur and sweep past the lens), then a long ease-out into the clearing.
 *              The last few percent of the move keep easing in until about 9 s, so the shot
 *              never stops dead before the ambient drift takes over.
 *   0.9 – 3.5  The blown-out glow of the clearing ahead thins. Palm trees stand against the
 *              sky; a band of gold stays in the air along the tree line for good.
 *   1.4 – 2.3  (phones) Leaves reach in from the left and right edges as their roots leave shot.
 *   2.1 – 3.7  The leaves framing the clearing swing open, nearest first, on springs.
 *   2.3 – 3.5  A bed of dark leaves grows up behind where the names will be, middle first,
 *              each leaf on a spring with its tip arriving last.
 *   2.5 – 3.5  Soft shade settles over that bed (this is what keeps the type readable).
 *   2.6 – 3.6  The wind holds its breath (anticipation) …
 *   3.1        ACT 2 · "Kyle", then "&", then "Daina" rise through masks, 120 ms apart.
 *              Legible from ~3.7; all three at rest by ~4.4.
 *   3.3 – 4.4  The two bird of paradise stalks (still in bud) and the heliconia rise into the thicket.
 *   3.5 – 5.5  … then one gust rolls left to right through the foliage as the camera comes to rest.
 *   4.1        "Coming soon"            4.3   "are getting married"
 *   4.55       six-colour bar           4.8   place        4.95  date        5.6  "Details to follow"
 *   5.1 – 6.6  ACT 3 · The two bird of paradise flowers open: orange sepals fan out of the
 *              spathe one by one, the cobalt petal last (left flower, then right).
 *   5.2 – 7.6  A string is thrown across the top, left to right, and papel picado unrolls along
 *              it flag by flag, each on a spring.
 *   5.85 – 8.2 A second string follows under the flags and its warm bulbs switch on, left to right.
 *   9.0        Intro over. Replay button appears. From here: slow camera float, wind that comes
 *              in gusts and lulls, drifting dust, twinkling bulbs. The ambient motion repeats
 *              exactly every 10 minutes, so there is no seam however long it is left open.
 *
 * WHERE TO CHANGE THINGS
 *   Names / place / date / wording ...... index.html (plain text inside <main class="copy">)
 *   Type sizes, colours of the copy ..... canopy.css
 *   Timing .............................. TL, just below
 *   Camera move, depth of each layer .... js/scene.js  (CAM, DEPTH at the top)
 *   Which plants go where ............... js/compose.js
 *   How each plant is drawn ............. js/plants.js  (papel picado is at the bottom of it)
 *   Light, wind, depth of field ......... js/shaders.js
 *   Palette ............................. js/kit.js (and :root in canopy.css)
 *
 * URL SWITCHES (for looking at the work)
 *   ?t=3.5      draw exactly that moment and hold it        ?copy=off   artwork without the text
 *   In the console: __timeline.seek(6), __timeline.play(), __timeline.pause()
 * ================================================================================================= */
import { createScene } from './scene.js';
import { clamp, lerp, prog, spring, easeOutExpo, easeOutQuint, easeOutCubic, easeOutBack } from './kit.js';

export const TL = {
  fadeIn: 0.45,                // fade up from green
  dolly: 4.2,                  // length of the camera move
  portal: [0.9, 3.5],          // clearing glow: from blown out … to settled
  part: 2.1,                   // foreground leaves begin to swing open
  bed: 2.3,                    // the bed of dark leaves starts to rise behind where the names will be
  pool: [2.5, 3.5],            // soft shade over the bed fades up
  names: 3.1, nameGap: 0.12, nameDur: 1.1,
  stalks: 3.3,                 // bird of paradise stalks (in bud) and heliconia rise into the thicket
  gust: 3.5,                   // arrival gust starts
  kicker: 4.1, sub: 4.3, bar: 4.55, place: 4.8, date: 4.95, note: 5.6,
  bloom: 5.1, bloomGap: 0.55, sepalGap: 0.085,
  flags: 5.7,                  // first papel picado flag unrolls
  lights: 6.4,                 // first bulb switches on
  end: 9.0,                    // intro length; Replay appears
  rest: 14.0,                  // the still frame shown when the visitor prefers reduced motion
};

const html = document.documentElement;
/* index.html gives the script 4 s to arrive before it shows the plain page. If that already happened
 * (slow connection), the copy is on screen and being read: bring the scene up behind it, settled. */
const late = !html.classList.contains('js');
clearTimeout(window.__canopyTimer);
const params = new URLSearchParams(location.search);
const frozenT = params.has('t') ? Math.max(0, parseFloat(params.get('t')) || 0) : null;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const live = frozenT === null && !reduced;                    // free-running playback?
if (params.get('copy') === 'off') html.classList.add('copy-off');

/* =================================================================================================
 * The copy: real HTML, styled per frame from t (so it obeys ?t= exactly like the artwork)
 * ================================================================================================= */
const $ = (s) => document.querySelector(s);
const el = {
  stage: $('.stage'), canvas: $('#scene'), block: $('#block'), kicker: $('.kicker'), words: [...document.querySelectorAll('.names .word')],
  sub: $('.sub'), bar: [...document.querySelectorAll('.bar span')], place: $('.place span'), date: $('.date span'),
  note: $('.note'), replay: $('.replay'),
};
let copySettled = false;
let refocusReplay = false;                                    // Replay was used from the keyboard: hand focus back when it returns

function applyCopy(t) {
  if (copySettled && t > TL.end + 1) return;                 // nothing left to animate: stop touching the DOM
  copySettled = t > TL.end + 1;

  // names: each word rises through its mask on a long ease-out; the ampersand tips in on a spring
  el.words.forEach((w, i) => {
    const start = TL.names + i * TL.nameGap, p = easeOutExpo(prog(t, start, TL.nameDur));
    const isAmp = w.classList.contains('amp');
    const tilt = (1 - p) * (isAmp ? -16 : 3.5);
    const pop = isAmp ? lerp(0.7, 1, spring(t - start - 0.12, 8, 4.2)) : 1;
    const landed = p >= 1 && Math.abs(pop - 1) < 0.002;      // once at rest, drop the transform so the type is laid out crisp
    w.style.transform = landed ? 'none' : `translate3d(0,${((1 - p) * 112).toFixed(2)}%,0) rotate(${tilt.toFixed(2)}deg) scale(${pop.toFixed(4)})`;
    w.style.opacity = clamp(p * 6).toFixed(3);
    w.style.filter = p < 0.6 ? `blur(${((0.6 - p) * 4.5).toFixed(2)}px)` : 'none';   // a breath of softness at the very start only
    w.style.willChange = p > 0 && p < 1 ? 'transform' : 'auto';
  });

  // "Coming soon": tracks in from wide
  let p = easeOutQuint(prog(t, TL.kicker, 0.95));
  const ls = lerp(0.86, 0.34, p).toFixed(4) + 'em';
  el.kicker.style.letterSpacing = ls; el.kicker.style.textIndent = ls;
  el.kicker.style.opacity = p.toFixed(3);
  el.kicker.style.transform = p >= 1 ? 'none' : `translate3d(0,${((1 - p) * 9).toFixed(2)}px,0)`;

  // "are getting married"
  p = easeOutQuint(prog(t, TL.sub, 0.95));
  el.sub.style.opacity = p.toFixed(3);
  el.sub.style.transform = p >= 1 ? 'none' : `translate3d(0,${((1 - p) * 16).toFixed(2)}px,0)`;

  // six-colour bar: segments snap in left to right, each overshooting a touch
  el.bar.forEach((s, i) => {
    const q = prog(t, TL.bar + i * 0.055, 0.5);
    s.style.transform = q >= 1 ? 'none' : `scale(${Math.max(0, easeOutBack(q, 2.2)).toFixed(4)},1)`;
    s.style.opacity = q > 0 ? '1' : '0';
  });

  // place and date rise out of their own baselines
  [[el.place, TL.place], [el.date, TL.date]].forEach(([node, start]) => {
    const q = easeOutQuint(prog(t, start, 0.85));
    node.style.transform = q >= 1 ? 'none' : `translate3d(0,${((1 - q) * 115).toFixed(2)}%,0)`;
    node.style.opacity = clamp(q * 4).toFixed(3);
  });

  p = easeOutCubic(prog(t, TL.note, 1.1));
  el.note.style.opacity = p.toFixed(3);
  el.note.style.transform = p >= 1 ? 'none' : `translate3d(0,${((1 - p) * 8).toFixed(2)}px,0)`;

  // Replay: only once the intro has finished (and never in reduced-motion mode: nothing to replay)
  const r = reduced ? 0 : easeOutCubic(prog(t, TL.end, 0.7));
  const wasHidden = el.replay.hidden;
  el.replay.hidden = r <= 0;
  el.replay.style.opacity = r.toFixed(3);
  if (wasHidden && r > 0 && refocusReplay) { refocusReplay = false; el.replay.focus({ preventScroll: true }); }
}

/** put the page back to plain, readable HTML (used if anything in here fails) */
function bail() {
  pause();
  html.classList.remove('js', 'ready', 'late');
  for (const n of [el.block, el.kicker, ...el.words, el.sub, ...el.bar, el.place, el.date, el.note]) n.removeAttribute('style');
  el.replay.hidden = true;
}

/** where the copy is on screen: the scene keeps foliage off it and lays the shade behind it */
function measure() {
  const W = el.stage.clientWidth, H = el.stage.clientHeight, S = Math.sqrt(W * H);
  // The copy sits a little above centre (--lift in canopy.css). Land it on a whole device pixel:
  // type on a fractional pixel is rasterised slightly differently from one load to the next.
  const dpr = window.devicePixelRatio || 1, snap = (v) => Math.round(v * dpr) / dpr;
  const lift = Math.round((parseFloat(getComputedStyle(el.block).getPropertyValue('--lift')) || 0) * H);
  el.block.style.transform = `translate(0px,${lift}px)`;
  const s = el.stage.getBoundingClientRect();
  let b = el.block.getBoundingClientRect();
  const fx = snap(b.left) - b.left, fy = snap(b.top) - b.top;
  if (fx || fy) { el.block.style.transform = `translate(${fx}px,${lift + fy}px)`; b = el.block.getBoundingClientRect(); }
  const l = b.left - s.left, t = b.top - s.top, pad = 6;
  // the Replay control (measured even while hidden, so the composition is the same before and after it appears)
  const hid = el.replay.hidden; el.replay.hidden = false;
  const rr = el.replay.getBoundingClientRect(); el.replay.hidden = hid;
  const inset = parseFloat(getComputedStyle(el.replay).paddingLeft) || 0;
  return {
    W, H,
    safe: { l: l - pad, t: t - pad, r: l + b.width + pad, b: t + b.height + pad },
    // the shade: an ellipse a little bigger than the copy
    pool: { cx: l + b.width / 2, cy: t + b.height / 2, ry: b.height * 0.5 + 0.035 * S,
            rx: b.width * 0.56 + 0.03 * S + 0.2 * Math.max(0, l - 0.05 * S) },
    replay: rr.width ? { l: rr.left - s.left + inset, t: rr.top - s.top, r: rr.right - s.left, b: rr.bottom - s.top } : null,
  };
}

/* =================================================================================================
 * The scene (WebGL). If it cannot start, the copy still animates over the CSS gradient.
 * ================================================================================================= */
let scene = null;
try {
  scene = createScene(el.canvas, TL);
} catch (err) {
  html.classList.add('no-gl');
}
/* a phone may take the GPU away (backgrounded, memory pressure) and hand it back later */
el.canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  if (scene) { try { scene.dispose(); } catch (err) { /* already gone */ } scene = null; }
  html.classList.add('no-gl');
});
el.canvas.addEventListener('webglcontextrestored', () => {
  try {
    scene = createScene(el.canvas, TL);                        // redraws every plant and rebuilds the layers
    html.classList.remove('no-gl');
    fitScene(true);
    if (!html.classList.contains('ready')) return;
    if (wantPlay) play();                                       // (the clock stops once the copy has landed if there is no scene to move)
    if (!clock.playing) draw(clock.t);
  } catch (err) { scene = null; html.classList.add('no-gl'); }
});

/* resolution: sharp enough to read leaf veins, light enough for a mid-range phone.
 * QUALITY is chosen once, before the clock starts, by timing the GPU on the heaviest frame of the
 * piece (see start). It can step down later only if the device becomes much slower than it was. */
const QUALITY = [1, 0.8, 0.65];
let qi = 0;
function pickDpr(W, H) {
  const cap = Math.min(W, H) < 520 ? 1.5 : 2;
  return Math.max(0.5, Math.min(window.devicePixelRatio || 1, cap, Math.sqrt(3.2e6 / (W * H))) * QUALITY[qi]);
}
const fitted = { W: 0, H: 0 };
function fitScene(full) {
  if (!scene) return;
  const m = measure();
  scene.resize(m.W, m.H, pickDpr(m.W, m.H));
  if (full) { scene.layout(m); fitted.W = m.W; fitted.H = m.H; }
}

/* =================================================================================================
 * The clock
 * ================================================================================================= */
const clock = { t: 0, playing: false, origin: 0, raf: 0, last: 0 };
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
const veil = { v: 0, target: 0 };                             // dip to deep green while the frame is recomposed after a resize

function draw(t) {
  clock.t = t;
  applyCopy(t);
  if (scene) scene.render(t, live ? pointer.x : 0, live ? pointer.y : 0, veil.v);
}

/* If frames start arriving much slower than this device was managing (it has heated up, say),
 * render fewer pixels: same picture, a little softer. The yardstick is the device's own best
 * pace this session, so a display that simply runs at 30 Hz (iOS Low Power Mode) is left alone. */
const pace = { n: 0, sum: 0, best: Infinity, strikes: 0 };
function govern(t, dt) {
  if (!scene || t < TL.end + 1 || qi >= QUALITY.length - 1) return;
  pace.n++; pace.sum += dt;
  if (pace.n < 90) return;
  const avg = pace.sum / pace.n;
  pace.n = 0; pace.sum = 0;
  pace.best = Math.min(pace.best, avg);
  pace.strikes = avg > pace.best * 1.7 ? pace.strikes + 1 : 0;
  if (pace.strikes >= 3) { qi++; pace.strikes = 0; pace.best = Infinity; fitScene(false); }   // (the frame is drawn right after, so the new buffer is never shown empty)
}

function loop(now) {
  clock.raf = requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - clock.last) / 1000);
  clock.last = now;
  const ease = 1 - Math.exp(-dt * 3.5);                       // pointer / tilt parallax glides, never snaps
  pointer.x += (pointer.tx - pointer.x) * ease;
  pointer.y += (pointer.ty - pointer.y) * ease;
  veil.v = veil.target > veil.v ? Math.min(veil.target, veil.v + dt / 0.12) : Math.max(veil.target, veil.v - dt / 0.3);
  const t = (now - clock.origin) / 1000;
  govern(t, dt);
  draw(t);
  if (!scene && t > TL.end + 1.5) pause();                    // no scene (no WebGL): once the copy has landed there is nothing left to move
}
function play() {
  if (clock.playing || document.hidden) return;
  clock.playing = true;
  clock.last = performance.now();
  clock.origin = clock.last - clock.t * 1000;
  clock.raf = requestAnimationFrame(loop);
}
function pause() {
  clock.playing = false;
  cancelAnimationFrame(clock.raf);
}
function seek(t) {
  copySettled = false;
  clock.t = Math.max(0, t);
  clock.origin = performance.now() - clock.t * 1000;
  if (!clock.playing) draw(clock.t);
}
let wantPlay = false;                                         // should it be running whenever the tab is visible?
// Warm-up: compose and draw one (unseen, deep-green) frame now, while the fonts are still loading,
// so shader compilation and texture upload are out of the way before the clock starts.
try { fitScene(true); if (scene) scene.render(-1); } catch (err) { scene = null; html.classList.add('no-gl'); }

window.__timeline = {
  duration: TL.end,
  seek,
  play() { wantPlay = true; play(); },
  pause() { wantPlay = false; pause(); },
  get time() { return clock.t; },
  get stats() { return scene && { ...scene.stats, quality: QUALITY[qi] }; },   // how many leaves are in each layer
};

/* =================================================================================================
 * Start: wait for the three typefaces (so nothing flashes in a fallback face), compose, go.
 * ================================================================================================= */
const FACES = ['400 1em "Instrument Serif"', 'italic 400 1em "Instrument Serif"', '700 1em "Space Mono"', '400 1em "Bricolage Grotesque"'];
const fontsLoaded = document.fonts ? Promise.all(FACES.map((face) => document.fonts.load(face))).then(() => document.fonts.ready) : Promise.resolve();
const fontsOrTimeout = Promise.race([fontsLoaded, new Promise((r) => setTimeout(r, 1500))]).catch(() => {});

function start() {
  fitScene(true);
  if (scene && live) {
    // how fast is this GPU? Time the heaviest frame (mid-push, leaves all over the lens) and pick
    // the resolution to suit, once, before anything is shown.
    const ms = scene.bench(1.4);
    qi = ms > 17 ? 2 : ms > 11 ? 1 : 0;
    if (qi) fitScene(false);
    scene.render(-1);                                         // back to the unseen deep-green frame
  }
  if (late) html.classList.add('js', 'late');
  html.classList.add('ready');
  if (frozenT !== null) { draw(frozenT); return; }            // ?t= : this frame, held
  if (reduced) { draw(TL.rest); return; }                     // reduced motion: the finished picture, still
  wantPlay = true;
  seek(late ? TL.end + 1.5 : 0);                              // arrived late: the copy is already being read, so skip to the settled scene
  play();
}
fontsOrTimeout.then(start).catch(bail);
// fonts that arrive after the timeout change the size of the copy: recompose around it
fontsLoaded.then(() => { if (html.classList.contains('ready')) { fitScene(true); if (!clock.playing) draw(clock.t); } }).catch(() => {});

/* ---- housekeeping ---------------------------------------------------------------------------- */
el.replay.addEventListener('click', () => {
  refocusReplay = document.activeElement === el.replay;      // it hides while the intro replays; give focus back after
  wantPlay = true; seek(0); play();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause(); else if (wantPlay) play();    // resumes from the same t, no jump
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  if (!html.classList.contains('ready')) return;              // start() will compose for whatever the size is by then
  if (!clock.playing) { fitScene(true); draw(clock.t); return; }   // held frame (?t=, reduced motion, hidden tab): recompose at once
  const W = el.stage.clientWidth, H = el.stage.clientHeight;
  // a rotation or a real window resize (not just a browser toolbar sliding away)?
  const big = Math.abs(W - fitted.W) > 2 || Math.abs(H / fitted.H - 1) > 0.12;
  fitScene(false);                                            // match the new size at once (no stretching) …
  if (big && scene) veil.target = 1;                          // … dip to deep green so the old layout is never seen in the new shape …
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { fitScene(true); veil.target = 0; }, 170);   // … recompose around the copy, and come back
});

if (live) {
  // desktop: the scene leans gently toward the pointer
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer.tx = clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1);
    pointer.ty = clamp(1 - (e.clientY / window.innerHeight) * 2, -1, 1);
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { pointer.tx = pointer.ty = 0; });
  // phones that share tilt without a permission prompt (Android): same effect from the gyroscope.
  // Only CHANGES in tilt move the scene: however the phone is held or laid down, it drifts back to rest.
  if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission !== 'function') {
    const rest = { x: 0, y: 0, at: 0, set: false };
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma === null || e.beta === null) return;
      const turn = (screen.orientation && screen.orientation.angle) || 0;      // which way up the screen is
      let x = e.gamma, y = e.beta;
      if (turn === 90) { x = e.beta; y = -e.gamma; } else if (turn === 270) { x = -e.beta; y = e.gamma; } else if (turn === 180) { x = -x; y = -y; }
      const now = performance.now(), k = rest.set ? 1 - Math.exp(-(now - rest.at) / 4000) : 1;
      rest.x += (x - rest.x) * k; rest.y += (y - rest.y) * k; rest.at = now; rest.set = true;
      pointer.tx = clamp((x - rest.x) / 14, -1, 1);
      pointer.ty = clamp((y - rest.y) / 14, -1, 1);
    }, { passive: true });
  }
}
