/* =================================================================================================
 * Kyle & Daina — Coming Soon · "Wallpaper"
 * main.js — the conductor: owns the clock, lays the ground under the copy, and tells the scene which
 * moment to draw. The whole piece (intro + endless ambient loop) is a pure function of one number,
 * t = seconds since the start, so any frame can be reproduced with ?t=<seconds>.
 *
 * THE SHOT (designed on a 390 × 844 phone first): a sheet of tropical wallpaper, painted foliage edge
 * to edge on cream linen. The camera pushes in and the flat print turns out to be thick jungle, leaf
 * behind leaf. The leaves get out of the camera's way: each is pushed aside, about its own root, and
 * swings out of the picture. Behind them all is the pale-gold middle of the sheet with the copy
 * already printed on it, and the last leaves in front of it part like a curtain: that is what uncovers
 * the names. NOTHING FADES: from t = 0 on no leaf, bunch, blossom or flower changes opacity or
 * colour-strength, grows in or pops; a leaf leaves the picture by moving out of it, and the gold is
 * not turned up, it is uncovered. (That holds off the timeline too: a rotated phone cuts to the new
 * layout, it does not cross-fade. The one other fade is for a guest whose connection is so slow that
 * the plain page was already up and being read: the settled picture then comes up round the copy.)
 * Nothing is lit, blurred or glossy either: it is painted and printed, and one woven-linen finish lies
 * over the artwork and the type together.
 *
 * THE PAGE IS LAYERED, bottom to top (index.html):
 *   (a) the ground: cream linen with the gold field in the middle ........ canvas.ground, js/ground.js
 *   (b) the copy: real text, on the page from the first frame ............. <main class="copy">
 *   (c) the foliage: WebGL, see-through wherever there is no leaf ......... canvas#scene, js/scene.js
 *   (d) the linen finish ................................................. canvas.finish, js/finish.js
 *   (e) Replay
 * So leaves pass IN FRONT of the letters, and their paper shadows fall across the gold and the type.
 *
 * TIMELINE (seconds, on the phone it was designed on)
 *
 *   (-0.35 – 0  The wallpaper comes up out of the bare linen: the one fade in the piece, and it is over
 *              before the clock proper starts. ?t=0 is the full sheet.)
 *   0.0        A sheet of wallpaper, hand-painted in gouache, foliage edge to edge on any shape of
 *              phone: banana leaves, palms, monstera, two bunches of bananas hanging in it with their
 *              maroon blossoms below them. Flat, like a wall (paper shadows barely there). Held for a
 *              beat: nothing visibly moves for most of half a second.
 *   0.26 – 3.06 The push. The camera travels 9 units in a straight line at the middle of the gold. Soft
 *              start, fastest about 1.1 – 1.4, long ease-out: 7% of the way by 0.5 s, 34% by 1.0,
 *              53% by 1.3, 65% by 1.5, 86% by 2.0, 96% by 2.5, and a last creep after it lands.
 *   0.24 – 1.6 THE PARTING. The wallpaper is ten shells of leaves, one behind another. As the camera
 *              comes on, each shell is pushed aside like foliage parted by a shoulder, the nearest (with
 *              the bananas) from 0.24, the next about every 0.06 s, the tenth from 0.78; inside a shell
 *              the leaves nearest the middle go first and the outermost 0.3 s later. Each leaf: a lean
 *              the OTHER way first, into the push (6 – 9 degrees over 0.2 s: the anticipation), then it
 *              swings about its root away from the line of travel (left-rooted leaves to the left,
 *              hanging ones up, and so on) on a spring that starts from rest, the stem leading, the blade
 *              bending, the tip trailing a quarter of a second behind and overshooting, and on out past
 *              the edge. What is seen: the sheet draws itself in a little (to about 0.6), opens from the
 *              middle (the fan palm and the bananas leave between 0.6 and 0.95), and then there is
 *              nothing but leaves parting to show more leaves until about 1.25. No leaf is ever seen at
 *              more than about twice its printed size, and the camera never reaches one: the last of the
 *              wallpaper has swung out of the picture by 1.6.
 *   1.0 – 3.0  THE LAST CURTAIN. What the wallpaper parts to show is the frame of the resting picture
 *              itself, seen from further back and SHUT: every plant of it bent in over the middle
 *              about its root, long leaves lying right across the names, the bananas and the birds of
 *              paradise (in bud) among them. From 1.0 (the first leaf, still hidden behind the last of
 *              the wallpaper) it springs open, the leaves nearest the middle first, tips last, the outer
 *              ones more and more gently as the camera arrives. The first slivers of gold between moving
 *              leaves at about 1.27; the names are being uncovered from about 1.3; "Kyle & Daina" is
 *              clear by about 2.25 and the small lines by about 2.45; the outermost leaves settle into
 *              their composed places as the camera lands, about 2.9. The copy is uncovered: nothing is
 *              inked in, nothing slides. (The sheet itself, gold and copy, is seen a few per cent smaller
 *              while the camera is still on its way, and is at its true size from the moment it lands:
 *              the camera's own move, see breathe below.)
 *   2.95 – 5.2 A string is thrown across the upper part of the opening and papel picado unrolls along
 *              it flag by flag (from 3.45), left to right, its ends tucked behind the foliage.
 *   4.1 – 5.7  The two birds of paradise open: orange sepals one by one, the cobalt petal last
 *              (left flower, then right).
 *   6.5        Intro over. Replay appears. From here: an almost imperceptible continued push and
 *              drift, leaves stirring very slightly, flags lifting, the gold breathing slowly (a few
 *              per cent). The stir of the leaves repeats exactly every 10 minutes, so there is no seam.
 *
 * WHERE TO CHANGE THINGS
 *   Names / place / date / wording ...... index.html (plain text inside <main class="copy">)
 *   Type sizes, colours of the copy ..... canopy.css
 *   HOW STRONG THE LINEN FINISH IS ...... --finish at the top of canopy.css (1 = base strength; it is set to 1.15)
 *   THE PARTING, the handful of numbers:
 *     how long the first frame is held ............. CAM.hold in js/scene.js (the camera) and the first `part` in WALL (the first leaf)
 *     when each shell of the wallpaper is pushed aside, how many leaves it has ... WALL in js/compose.js (`part`, `n`, `across`)
 *     how fast and how springy a leaf swings ....... LOOK.spring in js/scene.js (`pass` the wallpaper, `frame` the curtain)
 *     how a leaf of the wallpaper swings (how big the lean before it goes, how far the tip trails, how
 *     spread out a shell is, how soon it must be clear) ... SWING in js/compose.js; the length of the lean: ANT in js/shaders.js
 *     when the last curtain opens .................. TL.open, just below; how long it takes, how gently it ends
 *                                                    and how far each ring bends: CURTAIN in js/compose.js
 *     how much the sheet itself takes part in the push ... SHEET_FAR, below
 *   Camera move, depth of each layer .... js/scene.js  (CAM, DEPTH, PASS_DIST at the top)
 *   The colours of the gold field ....... GOLD in js/ground.js (it paints the ground)
 *   The print look: how faint each layer is printed, paper shadows, the warmth of the leaves beside
 *   the gold ............................ js/scene.js  (LOOK); the leaf program itself: js/shaders.js
 *   Where the bananas hang ............... js/compose.js (WALL_HANG: first frame; "THE HANGING BANANAS": at rest)
 *   Which plants go where ............... js/compose.js
 *   How each plant is painted ........... js/plants.js  (stroke-built gouache; papel picado is at the bottom of it)
 *   The weave and the light of the wall . js/finish.js
 *   Palette ............................. js/kit.js (and :root in canopy.css)
 *
 * URL SWITCHES (for looking at the work)
 *   ?t=3.5      draw exactly that moment and hold it        ?copy=off   artwork without the text
 *   ?finish=1.5 try another strength of the linen finish (0 – 2)
 *   ?only=pass4 draw just that layer of foliage over the ground and the copy (a list: pass0 … pass9 are
 *               the shells of the wallpaper, nearest first; back, mid, focal, near the rings of the frame;
 *               none = no foliage at all): the way to watch one shell part, or the curtain open, by itself
 *   ?mask=off   shade every leaf, hidden or not (THE MASK in js/scene.js is only a saving: the picture is the same)
 *   ?q=2,0      play as a phone would whose GPU timing asked for the lowest resolution during the push (2) and the
 *               full one at rest (0): the way to see the change of resolution at TL.sharp (0, 1, 2 = QUALITY below)
 *   In the console: __timeline.seek(6), __timeline.play(), __timeline.pause(), __timeline.stats
 * ================================================================================================= */
import { createScene } from './scene.js';
import { paintGround } from './ground.js';
import { clamp, prog, easeOutCubic } from './kit.js';

export const TL = {
  fadeIn: 0.35,                // the wallpaper comes up out of the bare linen: this long, ending at t = 0 (the only fade in the piece)
  dolly: 2.8,                  // length of the camera move (it begins after the hold: CAM.hold in scene.js)
  open: 1.0,                   // THE LAST CURTAIN begins to open: the first leaf lying across the names lets go (it is still behind the last of the wallpaper; the rest follow, outermost last, over about a second: CURTAIN.spread in compose.js)
  sharp: 2.3,                  // the heavy part is over (the wallpaper has gone, the curtain is mostly open): a device that was given fewer pixels for the push gets the full picture back here
  flags: 3.45,                 // first papel picado flag unrolls (the string is thrown half a second before)
  bloom: 4.1, bloomGap: 0.5, sepalGap: 0.085,
  end: 6.5,                    // intro length; Replay appears
  rest: 12.0,                  // the still frame shown when the visitor prefers reduced motion
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
const only = params.get('only') ? params.get('only').split(',') : null;   // ?only=pass3,near : draw just those layers of foliage
let maskWanted = params.get('mask') !== 'off';                // ?mask=off : shade everything, hidden or not (see THE MASK in scene.js; the picture is the same)
const forceQ = params.get('q') ? params.get('q').split(',').map((v) => clamp(parseInt(v, 10) || 0, 0, 2)) : null;   // ?q=2,0 : pretend the GPU timing chose that resolution step for the push and that one for the rest (see QUALITY)

/* =================================================================================================
 * The copy: real HTML, on the page from the first frame, under the foliage
 * ================================================================================================= */
const $ = (s) => document.querySelector(s);
const el = {
  stage: $('.stage'), canvas: $('#scene'), ground: $('.ground'), block: $('#block'), replay: $('.replay'),
  // one box per line of copy, for the layout of the leaves
  lines: [$('.kicker'), ...document.querySelectorAll('.names .line'), $('.sub'), $('.bar'), $('.place'), $('.date'), $('.note')],
};
let refocusReplay = false;                                    // Replay was used from the keyboard: hand focus back when it returns

/* The copy itself is never animated: it is printed on the gold from the first frame, under the
 * foliage, and the leaves uncover it. All that changes on the page per frame is the Replay control,
 * the slow breathing of the gold, and THE SHEET COMING NEARER (below): the camera's own move. */
function applyCopy(t) {
  // Replay: only once the intro has finished (never in reduced-motion mode: nothing to replay)
  const r = reduced || !scene ? 0 : easeOutCubic(prog(t, TL.end, 0.7));   // (and not without a scene: there would be nothing to play again)
  const wasHidden = el.replay.hidden;
  if (wasHidden !== r <= 0) el.replay.hidden = r <= 0;
  if (r > 0 && el.replay.style.opacity !== r.toFixed(3)) el.replay.style.opacity = r.toFixed(3);
  if (wasHidden && r > 0 && refocusReplay) { refocusReplay = false; el.replay.focus({ preventScroll: true }); }
}
/** THE GOLD breathes, very slowly and very little: a few per cent in strength and under two in size.
 *  (It is always there at full strength, behind the foliage, from the first frame: nothing fades it in.)
 *  THE SHEET COMES NEARER: the gold and the copy printed on it are the far wall of the jungle, a long way
 *  behind the last leaf, and the camera is travelling toward them. So while it travels they are seen a
 *  little smaller, about the middle of the gold (the point the camera is heading for), and arrive at
 *  their true size exactly as the camera lands: a few per cent, the same move as every leaf makes, only
 *  from much further off. It is not an animation of the copy: there is no cue, and from the moment the
 *  camera has landed the copy has no scale on it at all. */
const SHEET_FAR = 0.16;                                         // how much smaller the sheet is seen from where the camera starts (0 = it takes no part in the push)
const sheet = { base: '', k: '' };
function breathe(t) {
  if (!el.ground || !scene) return;
  const near = 1 / (1 + SHEET_FAR * scene.still(t));            // 1 once the camera has landed
  el.ground.style.opacity = (0.97 + 0.03 * Math.sin(t * 0.23 + 1.0)).toFixed(4);
  el.ground.style.transform = `scale(${(near * (1 + 0.018 * Math.sin(t * 0.31))).toFixed(5)})`;
  const k = near > 0.9997 ? '' : ` scale(${near.toFixed(5)})`;
  if (k !== sheet.k) { sheet.k = k; el.block.style.transform = sheet.base + k; }
}

/** put the page back to plain, readable HTML (used if anything in here fails) */
function bail() {
  pause();
  html.classList.remove('js', 'ready', 'late');
  el.block.removeAttribute('style');
  el.replay.hidden = true;
}

/** where the copy is on screen: the scene builds the opening in the leaves round it, and keeps every leaf off it */
function measure() {
  const W = el.stage.clientWidth, H = el.stage.clientHeight;
  // The copy sits a little above centre (--lift in canopy.css). Land it on a whole device pixel:
  // type on a fractional pixel is rasterised slightly differently from one load to the next.
  const dpr = window.devicePixelRatio || 1, snap = (v) => Math.round(v * dpr) / dpr;
  const lift = Math.round((parseFloat(getComputedStyle(el.block).getPropertyValue('--lift')) || 0) * H);
  el.block.style.transform = `translate(0px,${lift}px)`;
  const s = el.stage.getBoundingClientRect();
  let b = el.block.getBoundingClientRect();
  const fx = snap(b.left) - b.left, fy = snap(b.top) - b.top;
  if (fx || fy) { el.block.style.transform = `translate(${fx}px,${lift + fy}px)`; b = el.block.getBoundingClientRect(); }
  sheet.base = el.block.style.transform; sheet.k = '';         // (measured at its true size: THE SHEET COMING NEARER is put back on by the next frame)
  const l = b.left - s.left, t = b.top - s.top, pad = 6;
  // line by line (nothing in the copy ever moves, so these are the boxes at every moment of the piece)
  const box = (r) => ({ l: r.left - s.left - pad, t: r.top - s.top - pad, r: r.right - s.left + pad, b: r.bottom - s.top + pad });
  const lines = el.lines.map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0).map(box);
  // the same, but each line of the names only as wide as its words (stacked on a phone, the line "Kyle" is
  // a block as wide as "& Daina"): the room beside the short name is where a banana blossom may hang
  const tight = el.lines.map((n) => {
    const words = n.classList.contains('line') ? [...n.querySelectorAll('.word')].map((w) => w.getBoundingClientRect()).filter((r) => r.width > 0) : [];
    if (!words.length) return n.getBoundingClientRect();
    return { left: Math.min(...words.map((r) => r.left)), right: Math.max(...words.map((r) => r.right)), top: Math.min(...words.map((r) => r.top)), bottom: Math.max(...words.map((r) => r.bottom)), width: 1, height: 1 };
  }).filter((r) => r.width > 0 && r.height > 0).map(box);
  // the Replay control (measured even while hidden, so the composition is the same before and after it appears)
  const hid = el.replay.hidden; el.replay.hidden = false;
  const rr = el.replay.getBoundingClientRect(); el.replay.hidden = hid;
  const inset = parseFloat(getComputedStyle(el.replay).paddingLeft) || 0;
  return {
    W, H,
    safe: { l: l - pad, t: t - pad, r: l + b.width + pad, b: t + b.height + pad },
    block: { l, t },
    lines, tight,
    replay: rr.width ? { l: rr.left - s.left + inset, t: rr.top - s.top, r: rr.right - s.left, b: rr.bottom - s.top } : null,
  };
}

/* =================================================================================================
 * The scene (WebGL). If it cannot start, the copy is still printed, on the plain linen sheet.
 * ================================================================================================= */
/* Loaded with no size at all (a hidden pane, a pre-rendered tab)? There is no picture to compose at 0 × 0 and the
 * scene cannot start, so the plain sheet below is what gets set up. Once the page is given a real size, start over. */
if (!window.innerWidth || !window.innerHeight) {
  const startOver = () => { if (window.innerWidth && window.innerHeight) location.reload(); };
  window.addEventListener('resize', startOver);
  document.addEventListener('visibilitychange', startOver);
}

let scene = null;
/* is there WebGL at all? (Asked of a scrap canvas first: three.js reports a missing context as a console error.) */
const canGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (err) { return false; } })();
try {
  if (!canGL) throw new Error('no WebGL');
  scene = createScene(el.canvas, TL, only, maskWanted);
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
    scene = createScene(el.canvas, TL, only, maskWanted);                        // repaints every plant and rebuilds the layers
    html.classList.remove('no-gl');
    fitScene(true);
    scene.warm();
    if (!html.classList.contains('ready')) return;
    if (wantPlay) play();                                       // (the clock stops once the copy has set if there is no scene to move)
    if (!clock.playing) draw(clock.t);
  } catch (err) { scene = null; html.classList.add('no-gl'); }
});

/* resolution: sharp enough to read brush strokes, light enough for a mid-range phone.
 * QUALITY is chosen once, before the clock starts, by timing the GPU (see start) on the heaviest
 * frames of the piece, which are all in the push (ten shells of big leaves in front of a whole frame of
 * foliage), and on the resting picture, which is much lighter. A device that needs fewer pixels for
 * the push (`push`) is given them only for the push: at TL.sharp, with the leaves still moving, it goes
 * to what it can hold at rest (`rest`), so one heavy second does not cost the whole visit its sharpness.
 * After the intro it can step down (`floor`) only if the device becomes much slower than it was. */
const QUALITY = [1, 0.8, 0.65];
const q = { push: 0, rest: 0, floor: 0 };
let qi = 0, benchMs = null;
const qualityAt = (t) => Math.max(q.floor, t < TL.sharp ? q.push : q.rest);
function pickDpr(W, H) {
  // up to 2 device pixels per CSS pixel, phones included: that is what keeps a print print-sharp on a
  // dense phone screen. A GPU that cannot hold it is found out by the timing below and given fewer.
  return Math.max(0.5, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3.2e6 / (W * H))) * QUALITY[qi]);
}
const fitted = { W: 0, H: 0, at: 0 };
function fitScene(full) {
  if (!scene) return;
  if (!full) { scene.resize(el.stage.clientWidth, el.stage.clientHeight, pickDpr(el.stage.clientWidth, el.stage.clientHeight)); return; }
  const m = measure();
  scene.resize(m.W, m.H, pickDpr(m.W, m.H));
  const { glow } = scene.layout(m);                             // composes the foliage round the copy, and says where the gold is
  paintGround(el.ground, glow, m.W, m.H);                       // the bottom layer of the page: the gold field, behind the copy
  el.block.style.transformOrigin = `${(glow.x - m.block.l).toFixed(2)}px ${(glow.y - m.block.t).toFixed(2)}px`;   // THE SHEET COMING NEARER is about the middle of the gold
  fitted.W = m.W; fitted.H = m.H; fitted.at = performance.now();
}

/* =================================================================================================
 * The clock
 * ================================================================================================= */
const clock = { t: 0, playing: false, origin: 0, raf: 0, last: 0 };
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

function draw(t) {
  clock.t = t;
  applyCopy(t);
  breathe(t);
  if (!scene) return;
  if (qualityAt(t) !== qi) { qi = qualityAt(t); fitScene(false); }   // (the frame is drawn right after, so the new buffer is never shown empty)
  scene.render(t, live ? pointer.x : 0, live ? pointer.y : 0);
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
  if (pace.strikes >= 3) { q.floor = Math.min(QUALITY.length - 1, qi + 1); pace.strikes = 0; pace.best = Infinity; }   // (draw() makes the change)
}

function loop(now) {
  clock.raf = requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - clock.last) / 1000);
  clock.last = now;
  const ease = 1 - Math.exp(-dt * 3.5);                       // pointer / tilt parallax glides, never snaps
  pointer.x += (pointer.tx - pointer.x) * ease;
  pointer.y += (pointer.ty - pointer.y) * ease;
  const t = (now - clock.origin) / 1000;
  govern(t, dt);
  draw(t);
  if (!scene && t > TL.end + 1.5) pause();                    // no scene (no WebGL): once Replay is up there is nothing left to move
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
  clock.t = Math.max(-TL.fadeIn, t);                          // (the fade up from bare linen is the stretch before t = 0)
  clock.origin = performance.now() - clock.t * 1000;
  if (!clock.playing) draw(clock.t);
}
let wantPlay = false;                                         // should it be running whenever the tab is visible?
// Warm-up: compose and draw one (unseen, bare-linen) frame now, while the fonts are still loading,
// so shader compilation and texture upload are out of the way before the clock starts.
try { fitScene(true); if (scene) { scene.render(-1); scene.warm(); } } catch (err) { scene = null; html.classList.add('no-gl'); }

window.__timeline = {
  duration: TL.end,
  seek,
  play() { wantPlay = true; play(); },
  pause() { wantPlay = false; pause(); },
  get time() { return clock.t; },
  get stats() { return scene && { ...scene.stats, quality: QUALITY[qi], pushQuality: QUALITY[q.push], restQuality: QUALITY[q.rest], benchMs, mask: scene.mask }; },   // how many leaves are in each layer; how the last curtain closed; the GPU timing
};

/* =================================================================================================
 * Start: wait for the three typefaces (so nothing flashes in a fallback face), compose, go.
 * ================================================================================================= */
const FACES = ['400 1em "Instrument Serif"', 'italic 400 1em "Instrument Serif"', '700 1em "Space Mono"', '400 1em "Bricolage Grotesque"'];
const fontsLoaded = document.fonts ? Promise.all(FACES.map((face) => document.fonts.load(face))).then(() => document.fonts.ready) : Promise.resolve();
const fontsOrTimeout = Promise.race([fontsLoaded, new Promise((r) => setTimeout(r, 1500))]).catch(() => {});

const step = (ms) => (ms > 17 ? 2 : ms > 11 ? 1 : 0);          // GPU ms for one frame → which QUALITY it can hold at 60 a second
function start() {
  fitScene(true);
  if (scene && live) {
    // how fast is this GPU? Time the heaviest frames (the whole wallpaper, every layer of it still in shot, the
    // first leaves just swinging; and again mid-push, when the leaves have grown) and the resting picture, and
    // pick the resolution to suit, once, before anything is shown.
    // (the first twice: with and without the mask that spares it shading hidden leaves. Whichever is faster on this GPU is kept.)
    const masked = maskWanted ? scene.bench(0.45, 2, true) : Infinity, plain = scene.bench(0.45, 2, false);
    scene.mask = maskWanted = masked <= plain;
    const push = Math.max(Math.min(masked, plain), scene.bench(0.95, 1)), rest = scene.bench(TL.rest, 1);
    benchMs = [+push.toFixed(2), +rest.toFixed(2)];
    q.push = step(push); q.rest = Math.min(q.push, step(rest));
    if (forceQ) { q.push = forceQ[0]; q.rest = forceQ[1] ?? forceQ[0]; }
    scene.render(-1);                                         // back to the unseen bare-linen frame
  }
  if (late) html.classList.add('js', 'late');
  html.classList.add('ready');
  if (frozenT !== null) { draw(frozenT); return; }            // ?t= : this frame, held
  if (reduced) { draw(TL.rest); return; }                     // reduced motion: the finished picture, still
  wantPlay = true;
  seek(late ? TL.end + 1.5 : -TL.fadeIn);                     // arrived late: the copy is already being read, so skip to the settled scene
  play();
}
fontsOrTimeout.then(start).catch(bail);
// fonts that arrive after the timeout change the size of the copy: recompose around it
fontsLoaded.then(() => { if (html.classList.contains('ready')) { fitScene(true); if (!clock.playing) draw(clock.t); } }).catch(() => {});

/* ---- housekeeping ---------------------------------------------------------------------------- */
el.replay.addEventListener('click', () => {
  refocusReplay = document.activeElement === el.replay;      // it hides while the intro replays; give focus back after
  wantPlay = true; seek(-TL.fadeIn); play();
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
  // Then the picture is composed for the new shape at once and CUTS to it, as the rest of the page does: nothing fades,
  // and the old layout is never seen in the new shape. (While a window edge is being dragged: a few times a second.)
  // A toolbar sliding only changes the size of the canvas now; either way it is composed once more when things have stopped.
  fitScene(big && performance.now() - fitted.at > 120);
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => fitScene(true), 170);
});

if (live) {
  // desktop: the sheet leans very gently toward the pointer
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
