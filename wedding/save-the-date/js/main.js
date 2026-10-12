/* =================================================================================================
 * Kyle & Daina — Save the Date (kylebansavage.com/wedding/save-the-date)
 * It began as "Wallpaper", version 7 of the coming-soon studies: ../coming-soon/v7/ is that version as it stood when this
 * page was made from it, kept for the record. Where the notes below say "version 6" and "version 7" they are telling how
 * the piece came to be; this is the one that changes from here on.
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
 * VERSION 6 adds two things to that. THE DOORS: the page opens on a pair of slatted wooden doors, painted
 * like the wallpaper and shut (js/doors.js); a floating Open button (or a tap anywhere on them) swings
 * them back and the camera goes through the doorway into the wallpaper. That is the stretch of the clock
 * before t = 0 (DOOR, below), and the tap is also what lets the page play sound (SOUND, below). And THE
 * COPY SETS IN: the names and the lines under them each rise and come into focus as the leaves clear
 * from in front of them (INK_AT, INK), instead of simply being uncovered.
 *
 * VERSION 7 puts a PROLOGUE between the doors and the rest (PRO, below), and music under all of it. The
 * doors open as before, and as they open the camera is already on its way in: steadily and NOT slowly,
 * between the doors and THROUGH THE LEAVES of the opening picture, which are pushed out of its way one
 * after another, each taking its time over it. While it travels, a title card, "COMING NEXT YEAR", comes
 * up out of a blur in front of the leaves, stays two and a half seconds and goes; just as it has gone
 * the monkey from the end of the piece swings across the screen on a liana (js/swing.js); and as it
 * leaves, the leaves that are left part, a little faster, and uncover the copy. From t = 0 on that is
 * version 6's reveal, played a little slower than it was made (PRO.slow), with the last line of the copy
 * a button that opens the form for a guest's address (index.html). The camera never stops and never slows between the doors and the names.
 * The music (SOUND, below) starts with the tap on Open.
 *
 * TWO CLOCKS. t, the number in ?t= and in __timeline, is real seconds, and t = 0 is where the prologue
 * hands over to the reveal. The reveal itself (camera, leaves, curtain, copy, flags, flowers) runs on
 * version 6's own time, s = WARP.fwd(t): the same as t before 0, slower than t while the leaves part, and
 * t - 1.27 once the names are uncovered. Every number in TL, INK_AT, js/scene.js and js/compose.js that
 * is not part of PRO is in s.
 *
 * TIMELINE (seconds, on the phone it was designed on). The prologue is the 6.35 s before t = 0, and "+"
 * below is seconds after the tap on Open. The bars of the music begin at about +3.95, +7.92 and +11.89.
 *
 *   (on load   Bare linen until the doors, the wallpaper behind them and the typefaces are all ready; then
 *              the whole picture comes up out of the cloth at once, in 0.6 s: THE VEIL in canopy.css.
 *              The music is fetched meanwhile; the Open button waits for it, four seconds at most. All that
 *              while, on the linen and then on the doors, a paper tag says "Loading..." where the button
 *              will be, and the button comes up in its place.)
 *   -6.35  +0     The doors, shut, and the Open button. The clock waits here until the tap. The tap
 *                 starts the music.
 *   -6.29  +0.06  The two leaves swing back on their hinges at the edges of the screen (1.15 s), the
 *                 right one a moment after the left, and knock back a little off their stops.
 *   -5.95  +0.4   THE PUSH BEGINS, while the doors are still parting. It is at its full pace, 2.2 world
 *                 units a second, by +1.2, and holds it without a pause until the reveal takes over. The
 *                 camera travels in between the open doors (they stand still and slide out past the edges
 *                 of the screen, gone by about +1.8) and into the wallpaper. It set out 14 units further
 *                 back than version 6's camera, and the five nearest shells of leaves stand in its path.
 *                 Everything grows as it comes, and the nearer a leaf the faster.
 *   -5.85  +0.5   THE NEAR LEAVES GIVE WAY. From here to +4.25 the leaves of those five shells are pushed
 *                 out of the camera's way, the nearest shell first, a leaf about every 0.13 s. Each one goes
 *                 SLOWLY: about three seconds from being touched to having swung out of the picture (it is
 *                 seen to move from about a second after it is touched), three times its printed size by
 *                 then. First the four shells of the opening picture; then, touched from +3.5 and seen to
 *                 go from about +4.5 (after the title card, before the monkey swings in), the first shell
 *                 of the big leaves behind it. Behind them are more leaves, coming up.
 *   -5.2   +1.15  "COMING NEXT YEAR" comes up out of a blur (1.05 s), in front of the leaves, while the
 *                 open doors are sliding out of the picture …
 *   -4.15  +2.2   … is fully there and stays 2.45 s, drifting nearer (the second bar falls in it) …
 *   -1.7   +4.65  … and goes into a blur again (0.7 s: it has gone at +5.35).
 *   -0.95  +5.4   Just as it has gone, the monkey sets off across on a liana, left to right (2.4 s). It
 *                 starts out of the picture: it is seen from about +5.9, half a second after the card
 *                 has gone, to +7.3.
 *    0     +6.35  THE REST OF THE LEAVES, A LITTLE FASTER. Version 6's reveal from here: its camera move
 *                 takes over from the push without a join (PRO.handoff), the five shells still in the way
 *                 part, and the last curtain opens, all at 0.62 of the speed it was made at until the names
 *                 are uncovered (PRO.slow). In the list below, which is in version 6's own time: its 0.58
 *                 (the first of those five shells is touched) is +7.1 here; 1.0 (the curtain begins to
 *                 open) is +7.8, just before the third bar; 1.27 (the first gold) is +8.2; 1.5 (the names
 *                 begin to set in) is +8.6; 2.25 (the names clear) is +9.8; 2.9 (the camera lands) is
 *                 +10.5. From 3.0 on it is at full speed again, 1.27 s behind: the flags from +11.1, the
 *                 flowers from +11.7 (the fourth bar falls as they open), Replay at +14.1.
 *
 * VERSION 6'S REVEAL, in its own time (s). In version 7 the five nearest shells have gone before it starts,
 * the leaves that are left are nearly twice their printed size at s = 0, and nothing is held: the push is
 * already under way.
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
 *   ?t=-6.35    the doors, shut (?t=-5.7 half open; ?t=-3 the title card; ?t=0.2 the monkey; ?t=2 the first gold)
 *   ?slits=cream / ?slit=0.1   the gaps between the slats of the doors, closed / wider
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
import { createDoors } from './doors.js';
import { createSwing } from './swing.js';
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

/* THE PROLOGUE (version 7): everything between the tap on Open and t = 0, where the timeline above takes
 * over exactly as it was. The page waits, doors shut, at t = -PRO.len. The times in here are seconds
 * AFTER THE TAP, which is also when the music starts: its bars begin at about 3.95, 7.92 and 11.89 s.
 * As it stands the card is up across the second bar, the last curtain opens on the third (the first gold a
 * quarter of a second after it), and the birds of paradise open on the fourth. */
export const PRO = {
  len: 6.35,                   // seconds from the tap to t = 0. (Kyle's notes on the title card moved it: a second sooner, then 0.75 s and 0.2 s longer on screen;
                               // the monkey and everything after it keep their places after the card, so they moved with it)
  push: [0.4, 0.8],            // THE PUSH THROUGH THE LEAVES: the camera starts in this long after the tap (the doors are just parting), and takes this long to reach its pace
  pace: 2.2,                   // how fast it travels, in world units a second: STEADILY, AND NOT SLOWLY. It sets out 14 units further back than version 6's
                               // camera and goes through the five nearest shells of leaves on the way (js/scene.js). On screen the far leaves grow 9% a second
                               // at first and 16% by t = 0 (nearly twice as big by then), the nearest 19% to 56% (three times as big as they give way).
                               // (It was 0.24 at first, then 0.36, then 0.72: each time Kyle asked for faster. Slower = smaller.)
  handoff: [0.3, 1.0],         // after t = 0 it carries on at its pace for this long, then lets go over this long, as the camera move proper picks up: the camera never slows
  slow: {                      // THE REST OF THE LEAVES, PUSHED THROUGH SLIGHTLY FASTER: from t = 0 the shot is version 6's reveal (camera, leaves, curtain,
    rate: 0.62,                //   copy), played at this share of its speed, so that it is only a little faster than the push that led to it (and its
    in: 0.6,                   //   leaves pull away that much more slowly). The rate comes down to it over this long (s) …
    until: 2.0,                //   … holds until this moment of version 6's timeline (the names are all but uncovered) …
    out: 1.2,                  //   … and is back to 1 this long after that: the flags, the flowers and Replay come at their usual pace.
  },
  card: {                      // THE TITLE CARD ("Coming next year": the words are in index.html)
    in: [1.15, 1.05],          // it starts to come up out of its blur this long after the tap (the doors are just open, and on their way out of the picture), and takes this long
                               // (it was 2.65, then 2.15: Kyle asked for it sooner twice, half a second and then a whole one)
    hold: 2.45,                // it stays, fully there, this long (it was 1.3: Kyle asked for 750 ms more, then 200 ms more, twice. The second 200 ms
                               // came out of the gap before the monkey, below, so that the card fades just before the monkey comes: nothing after it moved)
    out: 0.7,                  // and takes this long to go
    blur: 14,                  // how blurred it starts and ends (px)
    grow: 0.07,                // it drifts this much nearer (bigger) while it is on screen: it is pushed into like everything else
  },
  near: {                      // THE NEAR LEAVES GIVE WAY: the camera goes through the leaves of the opening picture, and each is pushed out of its way, SLOWLY (js/compose.js)
    shells: 5,                 // the five nearest shells of the wallpaper: the opening picture (four shells, about twenty plants and the two bunches of
                               // bananas) and the first shell of big leaves behind it, which go last, after the title card and before the monkey swings in
    from: -5.85,               // the first leaf is touched at this t (0.5 s after the tap; it is seen to move from about a second later) …
    to: -2.1,                  // … and the last at this one (4.25 s after the tap): the nearest shell first, a leaf about every 0.13 s
    clear: 3.0,                // from being touched to having gone takes a leaf about this long (most of the movement is in the middle second and a half) …
    tempo: [0.22, 0.28],       // … which is this share of the speed of version 6's parting: a long heavy leaf … a short light one. SLOWER LEAVES = smaller numbers (and a longer `clear`)
    tipLag: [0.45, 0.7],       // how far the tip trails behind the stalk (s): a limp blade, bending as it goes
    ant: [0.04, 0.07],         // how far it leans into the push first (radians)
    mag: 3.0,                  // how many times its printed size a leaf has grown to by the time it has gone: this is what sets how near the camera's path the near shells stand
  },
  monkey: {                    // THE MONKEY that swings across (js/swing.js)
    gap: 0.05,                 // it sets off this long after the card has gone (it was 0.25). It starts out of the picture, and is first seen about
                               // half a second after the card has gone
    len: 2.4,                  // one swing across takes this long. It is in the picture for three fifths of that: about 1.45 s
                               // (it was 2.0, about 1.2 s in the picture; Kyle asked for a quarter of a second slower)
    angle: 40,                 // how far the liana swings each way (degrees)
    drag: 9,                   // how far its body trails behind its hand at full speed (degrees)
  },
};

/* THE DOORS (js/doors.js). The page opens on a pair of slatted wooden doors, shut. The tap on Open starts
 * the clock: the leaves swing back, and the camera goes through the doorway as they do (PRO.push). */
export const DOOR = {
  swing: [0.06, 1.15],         // each leaf swings open: starts this long after the tap, takes this long
  lag: 0.09,                   // the right-hand leaf follows the left by this much
  angle: 80,                   // how far each opens (degrees): back against the wall, enough of it still in sight to be a doorway
  rebound: 2.6,                // it knocks back off its stop by about this many degrees, once, and stays
  pass: 1.9,                   // THE CAMERA TRAVELS IN PAST THEM: the open doors stand still, and are out of the picture once the camera has
                               // come this far (world units: at PRO.pace that is about 1.8 s after the tap). Smaller = they pass sooner
  slits: 'leaves',             // the gaps between the slats: 'leaves' = open, the wallpaper behind shows through them · 'cream' = closed, a line of the sheet's cream
  slit: 0.11,                  // how wide a gap is, as a share of one slat and its gap (0.11 is about 5 px on a phone: enough to make out leaf, banana and blossom; 0.07 is a hairline)
};

/* SOUND. A browser only lets a page make sound from inside a tap or a click (iOS Safari is the strictest
 * about it), and Open is that tap: what is listed here starts in openDoors(), in the same instant as the gesture.
 *   music  the piece of music Kyle supplied (the White Lotus theme, trimmed to start 20 s in: 53 s of music,
 *          then silence). It is fetched when the page loads (index.html asks for it before anything else),
 *          starts with the tap, plays once, and starts again with Replay. The prologue is cut to it (PRO).
 * The two sounds made for version 6 are SWITCHED OFF FOR NOW, not removed: take the "//" off a line to have it back.
 *   open   a one-shot as the doors open: a soft swish of air, the slats ticking, and a gentle wooden knock as
 *          each leaf comes to rest (it plays again on Replay).
 *   bed    a loop that starts with it and keeps going: jungle ambience, birds and insects. The file fades
 *          up over its first 2.5 s and down over its last 2.5 s, so it comes in gently and loops without a click.
 *   (Those two were made by a script kept with version 7, ../coming-soon/v7/audio/make-sounds.mjs: synthesised, not recordings.)
 * All are ordinary audio files played through <audio> elements: iOS ignores audio.volume, so the level (and
 * any fade) has to be in the file itself.
 * The small speaker control (bottom left, once the doors have been opened) turns the sound off and on. */
const SOUND = {
  music: './audio/white-lotus-theme.mp3',
  // open: './audio/door-open.mp3',
  // bed: './audio/jungle.mp3',
};
const LOOPING = ['bed'];                                      // these go round and round; anything else plays once, in step with the picture

const html = document.documentElement;
/* index.html gives the script 4 s to arrive before it shows the plain page. If that already happened
 * (slow connection), the copy is on screen and being read: bring the scene up behind it, settled. */
const late = !html.classList.contains('js');
clearTimeout(window.__canopyTimer);
const params = new URLSearchParams(location.search);
const frozenT = params.has('t') ? Math.max(-PRO.len, parseFloat(params.get('t')) || 0) : null;   // (?t=-6.35 is the doors, shut)
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const live = frozenT === null && !reduced;                    // free-running playback?
const useDoors = !reduced && !late;                           // the doors are part of the intro: none without it
if (params.get('slits')) DOOR.slits = params.get('slits');    // ?slits=cream or ?slits=leaves, ?slit=0.1 : try the gaps between the slats another way
if (parseFloat(params.get('slit'))) DOOR.slit = clamp(parseFloat(params.get('slit')), 0.03, 0.2);
if (params.get('copy') === 'off') html.classList.add('copy-off');
if (frozenT !== null) html.classList.add('frozen');           // a held frame: no rise out of the linen (canopy.css, THE VEIL)
const only = params.get('only') ? params.get('only').split(',') : null;   // ?only=pass3,near : draw just those layers of foliage
let maskWanted = params.get('mask') !== 'off';                // ?mask=off : shade everything, hidden or not (see THE MASK in scene.js; the picture is the same)
const forceQ = params.get('q') ? params.get('q').split(',').map((v) => clamp(parseInt(v, 10) || 0, 0, 2)) : null;   // ?q=2,0 : pretend the GPU timing chose that resolution step for the push and that one for the rest (see QUALITY)

/* =================================================================================================
 * The copy: real HTML, on the page from the first frame, under the foliage
 * ================================================================================================= */
const $ = (s) => document.querySelector(s);
const el = {
  stage: $('.stage'), canvas: $('#scene'), ground: $('.ground'), block: $('#block'), replay: $('.replay'),
  doors: $('.doors'), open: $('.open'), sound: $('.sound'), card: $('.card'), swing: $('.swing'), backing: $('.backing'),
  // one box per line of copy, for the layout of the leaves
  lines: [...document.querySelectorAll('.names .line'), $('.sub'), $('.bar'), $('.place'), $('.date'), $('.note')],
  // the pieces of copy that set in one after another (applyCopy), in order
  ink: [...document.querySelectorAll('.names .word'), $('.sub .ink'), ...document.querySelectorAll('.bar span'), $('.place .ink'), $('.date .ink'), $('.note .ink')],
};
let refocusReplay = false;                                    // Replay was used from the keyboard: hand focus back when it returns

/* The copy sits under the foliage and sets in piece by piece as the leaves clear from in front of it
 * (INK_AT, INK). Also changing on the page per frame: the Replay control,
 * the slow breathing of the gold, and THE SHEET COMING NEARER (below): the camera's own move. */
const INK_AT = [1.5, 1.68, 1.82, 2.25, 2.42, 2.47, 2.52, 2.57, 2.62, 2.67, 2.8, 2.93, 3.1];   // when each piece of el.ink starts: Kyle, &, Daina, the italic line, six swatches, place, date, the button
const INK = { dur: 0.95, rise: 0.42, blur: 7 };               // seconds to set; how far it rises (in em); how soft it starts (px)
const inkWas = [];
function applyCopy(t) {
  // THE COPY SETS IN, piece by piece, while the leaves are still clearing from in front of it:
  // each rises a little and comes into focus, like ink taking to the cloth.
  // NO FILTER IS EVER LEFT ON THE COPY. iOS draws text that has a CSS filter on it (any filter, however small the blur)
  // at a third of the screen's sharpness unless the text is on a layer of its own, so a piece that still had
  // "blur(0.32px)" on it at rest was plainly blurred on every iPhone. So: a piece that has not started is only hidden;
  // while it sets in it is on its own layer (will-change), where its blur is drawn true, right down to nothing;
  // and once it has set, every one of these styles is taken off it again ('set' below: its own state, so that
  // rounding can never leave the last frame's styles behind).
  el.ink.forEach((n, i) => {
    const p = reduced ? 1 : easeOutCubic(prog(t, INK_AT[i] ?? 3, INK.dur)), k = p >= 1 ? 'set' : p <= 0 ? 'hidden' : p.toFixed(3);
    if (inkWas[i] === k) return;
    inkWas[i] = k;
    if (p >= 1) { n.style.opacity = n.style.translate = n.style.filter = n.style.willChange = n.style.pointerEvents = ''; return; }
    n.style.pointerEvents = 'none';                           // (one of them is the button: it cannot be tapped before it can be seen, through the leaves)
    if (p <= 0) { n.style.opacity = '0'; n.style.translate = n.style.filter = n.style.willChange = ''; return; }
    const blur = (1 - p) * INK.blur;
    n.style.willChange = 'opacity, filter';
    n.style.opacity = k;
    n.style.translate = `0 ${((1 - p) * INK.rise).toFixed(3)}em`;
    n.style.filter = blur > 0.03 ? `blur(${blur.toFixed(2)}px)` : '';
  });
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
  const k = Math.abs(near - 1) < 0.0003 ? '' : ` scale(${near.toFixed(5)})`;
  if (k !== sheet.k) { sheet.k = k; el.block.style.transform = sheet.base + k; }
}

/** put the page back to plain, readable HTML (used if anything in here fails) */
function bail() {
  pause();
  html.classList.remove('js', 'ready', 'late', 'gate', 'opening', 'loaded');
  el.doors.hidden = el.card.hidden = el.swing.hidden = el.backing.hidden = true;
  el.sound.hidden = true;
  for (const a of Object.values(sound)) a.pause();
  el.block.removeAttribute('style');
  el.ink.forEach((n) => n.removeAttribute('style'));
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
  // the same, but each line of the names only as wide as its words (stacked on a phone, each line is
  // a block the width of the whole names): the room beside a short line is where a blossom or the monkey may hang
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
  if (doors) {                                                  // the prologue: the camera sets out from further back and pushes through the near leaves, which give way as it comes
    m.pre = { total: CREEP.total, back: (tau) => CREEP.total - CREEP.moved(WARP.inv(tau)) };   // (the scene thinks in scene time)
    m.early = PRO.near;
  }
  const { glow } = scene.layout(m);                             // composes the foliage round the copy, and says where the gold is
  paintGround(el.ground, glow, m.W, m.H);                       // the bottom layer of the page: the gold field, behind the copy
  el.block.style.transformOrigin = `${(glow.x - m.block.l).toFixed(2)}px ${(glow.y - m.block.t).toFixed(2)}px`;   // THE SHEET COMING NEARER is about the middle of the gold
  el.doors.style.perspectiveOrigin = `${glow.x.toFixed(1)}px ${glow.y.toFixed(1)}px`;   // and the doorway is seen from the same line: the camera is heading for the middle of the gold
  el.card.style.left = `${glow.x.toFixed(1)}px`; el.card.style.top = `${glow.y.toFixed(1)}px`;   // the title card sits on that line too: the wallpaper slides away from behind it evenly
  fitted.W = m.W; fitted.H = m.H; fitted.at = performance.now();
}

/* =================================================================================================
 * The clock
 * ================================================================================================= */
const clock = { t: 0, playing: false, origin: 0, raf: 0, last: 0 };
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
const T0 = useDoors ? -PRO.len : -TL.fadeIn;                  // where the piece begins: the doors, shut (without them: the rise out of bare linen)

const S1 = (x) => x * x * x - (x * x * x * x) / 2;            // the area under a smooth start (or stop), 0 … x

/* THE PUSH THROUGH THE LEAVES (PRO.push, PRO.pace, PRO.handoff): how far the camera has come in by time t, in world units.
 * It gathers pace as the doors swing open, travels at one pace all through the prologue and a little
 * beyond t = 0, and then lets go gradually as the camera move proper (scene.js: CAM) picks up: the
 * camera never slows down on the way in. (t is real time: seconds on the clock.) */
const CREEP = (() => {
  const a = -PRO.len + PRO.push[0], r = PRO.push[1], [h0, h1] = PRO.handoff, v = PRO.pace;
  const total = v * (0.5 * r + (h0 - a - r) + 0.5 * h1);
  const moved = (t) => (t <= a ? 0 : t < a + r ? v * r * S1((t - a) / r) : t <= h0 ? v * (0.5 * r + (t - a - r))
    : t < h0 + h1 ? v * (0.5 * r + (h0 - a - r) + h1 * ((t - h0) / h1 - S1((t - h0) / h1))) : total);
  return { total, moved };
})();

/* THE REST OF THE LEAVES, PUSHED THROUGH SLIGHTLY FASTER (PRO.slow). From t = 0 the scene, the copy and the
 * camera play version 6's timeline, but not at its speed: `scene time` runs at PRO.slow.rate of real time
 * while the leaves part and the names are uncovered, and comes back up to speed after. Everything before
 * t = 0 is in real time, and so are the title card, the monkey and the music.
 *   WARP.fwd(t)    real time (the clock) → scene time (version 6's timeline)
 *   WARP.inv(tau)  and back */
const WARP = (() => {
  const { rate: k, in: a, until, out: c } = PRO.slow;
  const tauA = a * (1 - (1 - k) * 0.5);                       // scene time when the rate has come down to k (real time a)
  const tB = a + Math.max(0, until - tauA) / k;               // real time at which scene time reaches `until`
  const tauB = tauA + k * (tB - a), tC = tB + c, tauC = tauB + c * (k + (1 - k) * 0.5);
  const fwd = (t) => (t <= 0 ? t : t < a ? t - (1 - k) * a * S1(t / a) : t < tB ? tauA + k * (t - a)
    : t < tC ? tauB + k * (t - tB) + (1 - k) * c * S1((t - tB) / c) : tauC + (t - tC));
  const inv = (tau) => {
    if (tau <= 0) return tau;
    if (tau >= tauC) return tC + (tau - tauC);
    let lo = 0, hi = tC;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (fwd(m) < tau) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  return { fwd, inv };
})();

/* the doors, and the monkey that swings across: painted as soon as the page has a size (the doors are what is on screen while the fonts load) */
const doors = useDoors ? createDoors(el.doors, DOOR) : null;
const swing = useDoors ? createSwing(el.swing, PRO.monkey) : null;
const fitDoors = () => {
  const W = el.stage.clientWidth, H = el.stage.clientHeight;
  if (doors && !el.doors.hidden) doors.paint(W, H);
  if (swing) swing.layout(W, H);
};
if (doors) fitDoors(); else el.doors.hidden = true;

/* THE TITLE CARD and THE MONKEY: plain functions of `u`, the time since the tap, like everything else. */
const CARD_AT = [PRO.card.in[0], PRO.card.in[0] + PRO.card.in[1] + PRO.card.hold, PRO.card.in[0] + PRO.card.in[1] + PRO.card.hold + PRO.card.out];   // it starts to come up · starts to go · has gone
const MONKEY_AT = CARD_AT[2] + PRO.monkey.gap;
let cardWas = null;
function applyCard(u) {
  const c = PRO.card, on = u > CARD_AT[0] && u < CARD_AT[2];
  if (!on) { if (cardWas !== '') { cardWas = ''; el.card.hidden = true; } return; }
  const a = prog(u, CARD_AT[0], c.in[1]), b = prog(u, CARD_AT[1], c.out);
  const seen = a * a * (3 - 2 * a) * (1 - b * b * (3 - 2 * b));                       // up smoothly, away smoothly
  const blur = c.blur * (1 - easeOutCubic(a)) + c.blur * 0.8 * b * b;                 // out of a blur, and back into one
  const size = 1 + c.grow * (u - CARD_AT[0]) / (CARD_AT[2] - CARD_AT[0]);             // drifting nearer all the while
  const key = `${seen.toFixed(3)}|${blur.toFixed(2)}|${size.toFixed(4)}`;
  if (key === cardWas) return;
  if (cardWas === '' || cardWas === null) el.card.hidden = false;
  cardWas = key;
  el.card.style.opacity = seen.toFixed(3);
  el.card.style.filter = blur > 0.04 ? `blur(${blur.toFixed(2)}px)` : '';
  el.card.style.transform = `translate(-50%,-50%) scale(${size.toFixed(4)})`;
}

/* sound: made ready now, started by the tap (see SOUND at the top).
 * A phone will not load an <audio> element before a gesture, so each file is fetched ahead as plain data
 * and handed to its element from memory: it then starts with the tap, not a moment after it. */
const sound = {}, soundLoads = [];
let soundOn = true, soundBegun = false;
if (useDoors) for (const [name, src] of Object.entries(SOUND)) if (src) {
  const a = new Audio(); a.preload = 'auto'; a.loop = LOOPING.includes(name);
  sound[name] = a;
  soundLoads.push(fetch(src).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(src)))).then((b) => { if (!a.src) a.src = URL.createObjectURL(b); }).catch(() => {}));
}
const soundReady = Promise.all(soundLoads);                   // (settles when every file has arrived, or failed to)
/** play a one-shot from `at` seconds into it. It keeps step with the picture: `at` is the time since the tap. */
function playFrom(name, at) {
  const a = sound[name];
  if (a.duration && at >= a.duration) return;                  // it is over
  try { if (Math.abs(a.currentTime - at) > 0.08) a.currentTime = Math.max(0, at); } catch (err) { /* not loaded yet: it starts from the top */ }
  playSound(name);
}
/** the tap on Open, or Replay: everything from the top. Always called from inside a tap or a click. */
function startSound() {
  soundBegun = true;
  for (const [name, a] of Object.entries(sound)) if (!a.src) a.src = SOUND[name];   // (tapped before it had been fetched: let it stream)
  if (el.sound.hidden && Object.keys(sound).length) el.sound.hidden = false;
  if (!soundOn) return;
  for (const [name, a] of Object.entries(sound)) { if (!a.loop) playFrom(name, 0); else if (a.paused) playSound(name); }
}
/** heard again after a silence (the speaker control, or the page coming back to the front): pick up where the picture is */
function resumeSound() {
  const u = clock.t - T0;
  for (const [name, a] of Object.entries(sound)) { if (a.loop) playSound(name); else playFrom(name, u); }
}
/** play one of them; if the copy held in memory will not play on this browser, fall back to the file itself */
function playSound(name) {
  const a = sound[name];
  a.play().catch(() => {
    if (!soundOn || document.hidden || !a.src.startsWith('blob:')) return;
    a.src = SOUND[name];
    a.play().catch(() => {});
  });
}
/** the speaker control: off = silence (nothing plays on Replay either), on = the sound again, from wherever the picture has got to */
function setSound(on) {
  soundOn = on;
  el.sound.setAttribute('aria-pressed', String(on));          // (canopy.css shows the speaker, or the speaker crossed out)
  el.sound.setAttribute('aria-label', on ? 'Sound on. Turn sound off' : 'Sound off. Turn sound on');
  if (!on) { for (const a of Object.values(sound)) a.pause(); }
  else if (soundBegun && !document.hidden) resumeSound();
}

const BACKING_UNTIL = 1.0;                                     // scene time. Measured on twelve shapes of screen: until about 1.14 nothing shows between the leaves but specks at
                                                               // the edges (a quarter of a per cent of the picture at most), and the real opening begins there. So the shade stays until 1.0
/** what the scene is told about the push through the leaves at real time t: how far back the camera still is, how far it has come */
const preAt = (t) => { const crept = CREEP.moved(t); return { back: CREEP.total - crept, crept }; };
function draw(t) {
  clock.t = t;                                                // real time: seconds on the clock (the title card, the monkey and the music go by this)
  const s = doors ? WARP.fwd(t) : t;                          // scene time: where the scene, the copy and the camera are on version 6's timeline (PRO.slow)
  applyCopy(s);
  breathe(s);
  let pre = null;
  if (doors) {                                                // THE PROLOGUE (PRO): the doors, the push through the leaves, the title card, the monkey
    const u = t - T0;                                         // seconds since the tap
    pre = preAt(t);                                           // (the scene pulls its camera back by what is still to come: scene.js, render)
    doors.apply(u, pre.crept / DOOR.pass);
    applyCard(u);
    swing.apply((u - MONKEY_AT) / PRO.monkey.len);
    // deep shade behind the foliage until the last leaves are about to part (it is behind solid paint when it goes)
    const shade = s < BACKING_UNTIL;
    if (el.backing.hidden === shade) el.backing.hidden = !shade;
  }
  if (!scene) return;
  if (qualityAt(s) !== qi) { qi = qualityAt(s); fitScene(false); }   // (the frame is drawn right after, so the new buffer is never shown empty)
  // before t = 0 the wallpaper is simply there, whole, behind the doors and then under the push
  scene.render(s, live ? pointer.x : 0, live ? pointer.y : 0, pre);
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
  govern(doors ? WARP.fwd(t) : t, dt);
  draw(t);
  if (!scene && t > TL.end + 3.5) pause();                    // no scene (no WebGL): once Replay is up there is nothing left to move
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
  clock.t = Math.max(T0, t);                                  // (before t = 0 are the doors)
  clock.origin = performance.now() - clock.t * 1000;
  if (!clock.playing) draw(clock.t);
}
let wantPlay = false;                                         // should it be running whenever the tab is visible?
// Warm-up: compose and draw one (unseen, bare-linen) frame now, while the fonts are still loading,
// so shader compilation and texture upload are out of the way before the clock starts.
try { fitScene(true); if (scene) { scene.render(-1); scene.warm(); } } catch (err) { scene = null; html.classList.add('no-gl'); }

window.__timeline = {
  duration: TL.end,
  start: T0,                                                  // where the piece begins (the doors, shut)
  seek,
  play() { wantPlay = true; play(); },
  pause() { wantPlay = false; pause(); },
  get time() { return clock.t; },
  get sound() { return { on: soundOn, begun: soundBegun, ...Object.fromEntries(Object.entries(sound).map(([k, a]) => [k, { playing: !a.paused && !a.ended, at: +a.currentTime.toFixed(2), length: +(a.duration || 0).toFixed(2), fromMemory: a.src.startsWith('blob:') }])) }; },   // what the two sounds are doing
  get stats() { return scene && { ...scene.stats, quality: QUALITY[qi], pushQuality: QUALITY[q.push], restQuality: QUALITY[q.rest], benchMs, mask: scene.mask }; },   // how many leaves are in each layer; how the last curtain closed; the GPU timing
};

/* =================================================================================================
 * Start: wait for the typefaces (so nothing flashes in a fallback face, and the leaves are composed round the real copy), compose, go.
 * ================================================================================================= */
const FACES = ['400 1em "Instrument Serif"', 'italic 400 1em "Instrument Serif"', '700 1em "Space Mono"', '700 1em "Trajan Pro"'];   // (Trajan Bold: the title card)
const fontsLoaded = document.fonts ? Promise.all(FACES.map((face) => document.fonts.load(face))).then(() => document.fonts.ready) : Promise.resolve();
const fontsOrTimeout = Promise.race([fontsLoaded, new Promise((r) => setTimeout(r, 3000))]).catch(() => {});   // (the page is waiting behind its veil, and for a tap after that: worth giving the type three seconds to arrive)

const step = (ms) => (ms > 17 ? 2 : ms > 11 ? 1 : 0);          // GPU ms for one frame → which QUALITY it can hold at 60 a second
function start() {
  fitScene(true);
  if (scene && live) {
    // how fast is this GPU? Time the heaviest frames (the whole wallpaper, every layer of it still in shot, the
    // first leaves just swinging; and again mid-push, when the leaves have grown) and the resting picture, and
    // pick the resolution to suit, once, before anything is shown.
    // (the first twice: with and without the mask that spares it shading hidden leaves. Whichever is faster on this GPU is kept.)
    // (with the push through the leaves, where there is one: the leaves are bigger then, and there are heavy frames before t = 0 as well)
    const at = (tau) => (doors ? preAt(WARP.inv(tau)) : null);
    const masked = maskWanted ? scene.bench(0.45, 2, true, at(0.45)) : Infinity, plain = scene.bench(0.45, 2, false, at(0.45));
    scene.mask = maskWanted = masked <= plain;
    const push = Math.max(Math.min(masked, plain), scene.bench(0.95, 1, undefined, at(0.95)), doors ? scene.bench(-1.5, 1, undefined, at(-1.5)) : 0), rest = scene.bench(TL.rest, 1);
    benchMs = [+push.toFixed(2), +rest.toFixed(2)];
    q.push = step(push); q.rest = Math.min(q.push, step(rest));
    if (forceQ) { q.push = forceQ[0]; q.rest = forceQ[1] ?? forceQ[0]; }
    scene.render(-1);                                         // back to the unseen bare-linen frame
  }
  if (late) html.classList.add('js', 'late');
  html.classList.add('ready');
  fitDoors();
  if (frozenT !== null) {                                     // ?t= : this frame, held
    if (doors && frozenT <= T0 + 0.001) html.classList.add('gate');
    html.classList.add('loaded');
    draw(frozenT); return;
  }
  if (reduced) { html.classList.add('loaded'); draw(TL.rest); return; }   // reduced motion: the finished picture, still
  if (late) { wantPlay = true; seek(TL.end + 1.5); play(); return; }   // arrived late: the copy is already being read, so skip to the settled scene
  // THE DOORS, SHUT. The clock waits here for the tap: Open, or anywhere on the doors (openDoors below).
  seek(T0);
  // The Open button comes as soon as the music has arrived too, so that the tap starts both together. Until then the
  // "Loading..." tag stays where the button will be (canopy.css), over the doors: `loaded` takes it away as the button
  // comes up in its place. Four seconds at most: after that the button is there anyway, and the music starts as soon
  // as it can.
  Promise.race([soundReady, new Promise((r) => setTimeout(r, 4000))]).then(() => {
    if (html.classList.contains('ready') && !wantPlay) html.classList.add('gate');
    html.classList.add('loaded');
  });
}
/** the tap that opens the doors. It is also the gesture a browser needs before it will play sound. */
function openDoors() {
  if (!html.classList.contains('gate')) return;
  html.classList.remove('gate');
  html.classList.add('opening');                              // (the button shrinks away: canopy.css)
  startSound();
  wantPlay = true; seek(T0); play();
}
el.open.addEventListener('click', openDoors);
el.doors.addEventListener('click', openDoors);
el.sound.addEventListener('click', () => setSound(!soundOn));
el.open.addEventListener('animationend', (e) => { if (e.animationName === 'open-go') html.classList.remove('opening'); });   // gone: out of the page and out of the tab order
fontsOrTimeout.then(start).catch(bail);
// fonts that arrive after the timeout change the size of the copy: recompose around it
fontsLoaded.then(() => { if (html.classList.contains('ready')) { fitScene(true); if (!clock.playing) draw(clock.t); } }).catch(() => {});

/* ---- housekeeping ---------------------------------------------------------------------------- */
el.replay.addEventListener('click', () => {
  refocusReplay = document.activeElement === el.replay;      // it hides while the intro replays; give focus back after
  startSound();                                               // (a click too: the music starts again from the top)
  wantPlay = true; seek(T0); play();                          // from the doors, shut: they open by themselves this time
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause(); else if (wantPlay) play();    // resumes from the same t, no jump
  if (document.hidden) { for (const a of Object.values(sound)) a.pause(); }           // a page in the background is silent
  else if (soundBegun && soundOn) resumeSound();
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  fitDoors();
  if (!html.classList.contains('ready')) return;              // start() will compose for whatever the size is by then
  if (!clock.playing) { fitScene(true); draw(clock.t); return; }   // held frame (?t=, reduced motion, hidden tab, the doors shut): recompose at once
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
