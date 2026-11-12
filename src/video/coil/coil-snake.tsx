/** @jsxImportSource react */

/**
 * COIL: the snake playfield drawn over the time slider.
 *
 * Purely decorative (aria-hidden, pointer-events: none). The real input is the v10 TimeSlider underneath; this canvas
 * only reads its state:
 *   --media-slider-fill / --media-slider-buffer / --media-slider-pointer (CSS vars on the slider root)
 *   data-dragging / data-pointing (slider root), and paused / ended / waiting from the player store.
 *
 * Body length = elapsed time, head = playhead, pellets = time still to eat.
 *   lit pellets      loaded video; the last lit one blinks, and new ones light up one after another
 *   eating           jaw opens for each pellet, "+N" (seconds) pops
 *   seek forward     power-up: charge, then a boosted dash
 *   seek backward    cough: pellets are spat back onto the lane and the recoil pulls the snake back
 *   paused           the snake ties itself into a knot on the lane and idles there
 */

import { usePlayer } from '@videojs/react/video';
import { useContext, useEffect, useRef } from 'react';

import { drawHead as paintHead, drawPixelFace, HEAD_LENGTH } from './head';
import { makeBuffer, PIXEL } from './pixel';
import { StageGatesContext, useStages } from './stages';

type Pose = 'rest' | 'strain' | 'strike' | 'tongue';

export const C = {
  ink: '#0A0B0D',
  scale1: '#2B323C',
  scale2: '#5F6C7A',
  band: 'rgba(8,9,11,0.5)',
  rim: 'rgba(236,232,223,0.3)',
  gold: '#FFB21E',
  goldHot: '#FFF3C4',
  bone: '#ECE8DF',
  red: '#FF4D3D',
};

/** The sheen cycles teal > violet > bronze along the body, by distance from the head, so it never breaks at a bend. */
const SHEEN_STOPS = [
  [63, 209, 198],
  [139, 108, 255],
  [214, 154, 74],
];
export const SHEEN: string[] = [];
for (let i = 0; i < 96; i++) {
  const f = (i / 96) * SHEEN_STOPS.length;
  const a = SHEEN_STOPS[Math.floor(f) % 3];
  const b = SHEEN_STOPS[(Math.floor(f) + 1) % 3];
  const t = f - Math.floor(f);
  SHEEN.push(`rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(',')})`);
}
export const SHEEN_PERIOD = 520;
export const BAND_EVERY = 13;

const FONT = '"Jersey 15", ui-monospace, monospace';

/** Body thickness in px. Head art uses a 24-unit neck socket, so it scales by T / 24. */
const T = 18;
const NOSE = HEAD_LENGTH * T; // neck to nose tip

const STEP = 2.5;
/** Seconds between attempts to pull free of the knot while paused. */
const STRUGGLE = 3.2;
const PELLET_MIN_GAP = 6;
const PELLET_UNITS = [1, 2, 5, 10, 15, 30, 60, 120, 300];

/* ---- the knot: an overhand knot, drawn as a trefoil with one lobe cut open and its two ends pulled out sideways ---- */

const KNOT_U = 11; // px per trefoil unit
const KNOT_HALF = 4.6; // the ends leave at x = +/- KNOT_HALF units, on the track line

interface KnotPoint {
  x: number;
  y: number;
}

function buildKnot(): { pts: KnotPoint[]; length: number } {
  const tre = (t: number): [number, number] => [Math.sin(t) + 2 * Math.sin(2 * t), Math.cos(t) - 2 * Math.cos(2 * t)];
  const dTre = (t: number): [number, number] => [Math.cos(t) + 4 * Math.cos(2 * t), -Math.sin(t) + 4 * Math.sin(2 * t)];
  const A = 0.62; // how far from the cut lobe's tip the two ends join the trefoil (just outside its crossings)
  const raw: [number, number][] = [];

  const bezier = (p0: number[], p1: number[], p2: number[], p3: number[], n: number, skipFirst: boolean) => {
    for (let i = skipFirst ? 1 : 0; i <= n; i++) {
      const s = i / n;
      const m = 1 - s;
      raw.push([
        m * m * m * p0[0] + 3 * m * m * s * p1[0] + 3 * m * s * s * p2[0] + s * s * s * p3[0],
        m * m * m * p0[1] + 3 * m * m * s * p1[1] + 3 * m * s * s * p2[1] + s * s * s * p3[1],
      ]);
    }
  };

  // Head side: from the right, along the line, dipping under and up into the left arm.
  const t0 = Math.PI - A;
  const e0 = tre(t0);
  const d0 = dTre(t0);
  const l0 = Math.hypot(d0[0], d0[1]);
  const dir0 = [-d0[0] / l0, -d0[1] / l0]; // travel runs with decreasing t
  bezier([KNOT_HALF, 0], [KNOT_HALF - 2.4, 0], [e0[0] - dir0[0] * 2.2, e0[1] - dir0[1] * 2.2], e0, 40, false);

  // The two remaining lobes.
  const t1 = -Math.PI + A;
  for (let i = 1; i <= 220; i++) raw.push(tre(t0 + ((t1 - t0) * i) / 220));

  // Tail side: out of the right arm, under, and away to the left along the line.
  const e1 = tre(t1);
  const d1 = dTre(t1);
  const l1 = Math.hypot(d1[0], d1[1]);
  const dir1 = [-d1[0] / l1, -d1[1] / l1];
  bezier(e1, [e1[0] + dir1[0] * 2.2, e1[1] + dir1[1] * 2.2], [-KNOT_HALF + 2.4, 0], [-KNOT_HALF, 0], 40, true);

  // Resample at an even step, in px, y down.
  const px = raw.map(([x, y]) => ({ x: x * KNOT_U, y: -y * KNOT_U }));
  const out: KnotPoint[] = [px[0]];
  let carry = 0;
  let length = 0;
  for (let i = 1; i < px.length; i++) {
    const a = px[i - 1];
    const b = px[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    let at = STEP - carry;
    while (at <= seg) {
      out.push({ x: a.x + ((b.x - a.x) * at) / seg, y: a.y + ((b.y - a.y) * at) / seg });
      at += STEP;
    }
    carry = (carry + seg) % STEP;
    length += seg;
  }
  return { pts: out, length };
}

const KNOT = buildKnot();
const KNOT_SPAN = 2 * KNOT_HALF * KNOT_U;
/** How much body the knot uses up beyond the straight distance it spans. */
const KNOT_EXTRA = KNOT.length - KNOT_SPAN;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  color: string;
  size: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  born: number;
  life: number;
  color: string;
  size: number;
}

function readPercent(style: CSSStyleDeclaration, name: string): number | null {
  const raw = style.getPropertyValue(name).trim();
  if (!raw) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n / 100 : null;
}

/** Seek amounts drift by a fraction while playing: show 10, not 9. */
const snap = (sec: number) => {
  const five = Math.round(sec / 5) * 5;
  return five > 0 && Math.abs(sec - five) <= 1.5 ? five : Math.round(sec);
};

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function CoilSnake() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const paused = usePlayer((s) => s.paused);
  const ended = usePlayer((s) => s.ended);
  const waiting = usePlayer((s) => s.waiting);
  const duration = usePlayer((s) => s.duration);
  const started = usePlayer((s) => s.started);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);

  // Latest player state for the animation loop, without restarting it.
  const stages = useStages();
  const gates = useContext(StageGatesContext);

  const live = useRef({ paused, ended, waiting, duration, started, volume, muted, stages, gates });
  live.current = { paused, ended, waiting, duration, started, volume, muted, stages, gates };

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = canvas?.parentElement;
    if (!canvas || !root) return;
    // The snake, dots and flags are drawn into a small buffer and shown as hard pixels; the score pops are drawn
    // over them on the real canvas, in the pixel font, so their lettering stays sharp.
    const out = canvas.getContext('2d');
    if (!out) return;
    const buf = makeBuffer();
    const ctx = buf.ctx;
    let dprNow = 1;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    let W = 0;
    let H = 0;
    // The canvas reaches this far left of the slider (set in CSS as --coil-gutter): a run-up, so at 0:00
    // the head sits exactly on the start line with a good length of body behind it.
    let G = 66;
    // Drawing scale (set in CSS as --coil-scale). Phones draw the whole playfield smaller, so the snake has more room
    // to travel and more pellets fit on the lane. Everything below works in unscaled units.
    let K = 1;
    const resize = () => {
      const r = root.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const css = getComputedStyle(root);
      K = parseFloat(css.getPropertyValue('--coil-scale')) || 1;
      G = (parseFloat(css.getPropertyValue('--coil-gutter')) || 66) / K;
      W = r.width / K;
      H = r.height / K;
      dprNow = dpr;
      canvas.width = Math.round((W + G) * K * dpr);
      canvas.height = Math.round(H * K * dpr);
      buf.resize((W + G) * K, H * K);
      const s = K / PIXEL;
      ctx.setTransform(s, 0, 0, s, G * s, 0);
      out.setTransform(dpr * K, 0, 0, dpr * K, G * K * dpr, 0);
      ctx.direction = 'ltr'; // time and numbers read left to right in every language
      out.direction = 'ltr';
    };
    const ro = new ResizeObserver(resize);
    ro.observe(root);
    resize();

    // ---- animated state -------------------------------------------------------------------------------------------
    let shown = -1; // displayed playhead fraction
    let vel = 0;
    let lastTarget = -1;
    let knot = live.current.paused && live.current.started ? 1 : 0;
    let knotVel = 0;
    let pausedAt = performance.now();
    let wasPaused = live.current.paused;
    let holdUntil = 0; // the wind-up before a boost or a cough: the snake stays put
    let boostAt = -1e9;
    let coughAt = -1e9;
    let springMode: 'normal' | 'boost' | 'recoil' = 'normal';
    let springModeUntil = 0;
    let gulpStart = -1e9;
    let quietUntil = 0; // per-pellet pop-ups are muted during a seek
    let biteAt = -1e9;
    let eaten = -1; // pellets eaten so far
    let litF = -1; // how many pellets are shown lit (animates up to the buffered count)
    const spatAt = new Map<number, number>(); // pellet index -> when it was coughed back onto the lane
    const trail: { x: number; at: number }[] = [];
    let simFront = -1; // simulated loaded-up-to time in seconds, when the workbench asks for slow loading
    let simNext = 0;
    let introAt = -1e9;
    let wasStarted = live.current.started;
    let stage = -1; // index of the stage the head is in
    let comboSec = 0; // seconds added up over a burst of seeks
    let comboAt = -1e9;
    let calmSince = performance.now(); // when the knotted snake last came to rest
    let begun = live.current.started; // stays true once playback has started, even back at 0:00
    let lastDuration = 0;
    let runEaten = 0; // run-up pellets eaten during the intro
    let hov = 0; // eased hover amount, for the magnify under the cursor
    let phase = 0;
    let prev = performance.now();
    let raf = 0;
    const particles: Particle[] = [];
    const floaters: Floater[] = [];

    const burst = (x: number, y: number, n: number, color: string, now: number, spread = 2.4, dir = -Math.PI / 2) => {
      for (let i = 0; i < n; i++) {
        const a = dir + (Math.random() - 0.5) * spread;
        const sp = 40 + Math.random() * 80;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          born: now,
          life: 340 + Math.random() * 280,
          color,
          size: Math.random() < 0.4 ? 3 : 2,
        });
      }
      if (particles.length > 140) particles.splice(0, particles.length - 140);
    };

    /** Tell the HUD how much time the snake just gained or lost. */
    const score = (seconds: number) => {
      root.dispatchEvent(new CustomEvent('coil-score', { detail: seconds, bubbles: true }));
    };

    const pop = (x: number, y: number, text: string, color: string, size: number, now: number, life = 900) => {
      floaters.push({ x, y, text, born: now, life, color, size });
      if (floaters.length > 8) floaters.shift();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (!W || !H) return;

      const reduce = motionQuery.matches;
      const { paused, ended, duration, volume, muted, stages, gates } = live.current;
      const waiting = live.current.waiting || document.documentElement.hasAttribute('data-coil-stall');
      if (lastDuration > 0 && duration > 0 && Math.abs(duration - lastDuration) > 0.5) begun = false; // another video
      if (duration > 0) lastDuration = duration;
      if (live.current.started) begun = true;
      const started = begun;
      // louder = a faster, bigger wave down the body; muted = almost still
      const loud = muted ? 0 : Math.max(0, Math.min(1, volume));
      const waveSpeed = 0.25 + loud * 1.05;
      const waveAmp = 0.3 + loud * 0.95;
      const style = getComputedStyle(root);
      const dragging = root.hasAttribute('data-dragging');
      const pointing = root.hasAttribute('data-pointing');
      const fill = readPercent(style, '--media-slider-fill') ?? 0;
      let buffer = readPercent(style, '--media-slider-buffer') ?? fill;
      const pointer = readPercent(style, '--media-slider-pointer');
      const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;

      // Demo option: pretend the video loads slowly, in chunks, so the loading pellets can be seen on a fast connection.
      if (document.documentElement.hasAttribute('data-coil-slow-buffer') && dur > 0) {
        // Like a real stream: a burst loads a chunk of random size, then it stalls for a random while, and so on,
        // up to about 40 s ahead. After a seek it starts again from the new position. The video itself is unaffected.
        const cur = fill * dur;
        if (simFront < 0 || simFront < cur - 0.5 || simFront > cur + 60) {
          simFront = cur + 1;
          simNext = now + 400 + Math.random() * 900;
        } else if (now >= simNext && simFront < cur + 40) {
          simFront += 3 + Math.random() * 12;
          // a short stall usually, now and then a long one
          simNext = now + (Math.random() < 0.25 ? 2500 + Math.random() * 2500 : 500 + Math.random() * 1400);
        } else if (simFront < cur + 1) {
          simFront = cur + 1; // the real video never waits, so the loaded edge stays just ahead of the head
        }
        buffer = Math.min(buffer, simFront / dur);
      } else {
        simFront = -1;
      }

      const y0 = Math.round(H / 2); // the track line, centred in the lane
      const minNose = 0;

      // ---- seeks: boost forward, cough backward -----------------------------------------------------------------
      // While the head is dragged, the snake follows the pointer: forward eats, backward coughs pellets back up.
      const target = ended ? 1 : dragging && pointer !== null ? pointer : fill;
      if (lastTarget >= 0 && !dragging) {
        const jumpSec = (target - lastTarget) * dur;
        if (lastTarget > 0.97 && target < 0.03) {
          shown = target;
          vel = 0;
          eaten = -1;
          stage = -1;
          spatAt.clear();
        } else if (Math.abs(jumpSec) >= 3) {
          // seeks in quick succession add up into one pop: +10 +10 +10 reads +30
          const sameRun = now - comboAt < 900 && Math.sign(jumpSec) === Math.sign(comboSec);
          comboSec = sameRun ? comboSec + jumpSec : jumpSec;
          comboAt = now;
          quietUntil = now + 900;
          floaters.length = 0;
          const from = Math.max(minNose, shown * W);
          if (jumpSec > 0) {
            boostAt = now;
            gulpStart = now + 170;
            springMode = 'boost';
            pop(from + 10, y0 - 30, `+${snap(comboSec)}`, C.gold, 30, now, 1200);
            pop(from + 10, y0 + 40, 'BOOST', C.goldHot, 18, now, 800);
            score(snap(comboSec));
          } else {
            coughAt = now;
            springMode = 'recoil';
            pop(from, y0 - 30, `-${snap(-comboSec)}`, C.red, 30, now, 1200);
            score(-snap(-comboSec));
          }
          springModeUntil = now + 1400;
          if (!reduce) holdUntil = now + 170;
        }
      }
      lastTarget = target;
      if (now > springModeUntil) springMode = 'normal';

      if (shown < 0 || reduce) {
        shown = target;
        vel = 0;
      } else if (now >= holdUntil) {
        // Between timeupdates, glide forward at playback speed so the head never stutters.
        if (!paused && !dragging && dur > 0 && springMode === 'normal') shown += dt / dur;
        const k = springMode === 'boost' ? 300 : springMode === 'recoil' ? 150 : 170;
        const zeta = springMode === 'boost' ? 0.9 : springMode === 'recoil' ? 0.48 : 0.82;
        vel += (k * (target - shown) - 2 * Math.sqrt(k) * zeta * vel) * dt;
        shown += vel * dt;
      }
      shown = Math.max(0, Math.min(1, shown));
      const speed = Math.abs(vel) * W; // px per second from the spring

      // ---- knot (paused) spring -----------------------------------------------------------------------------------
      // In the first few seconds there is no room behind the head for a knot, so the snake just waits, straight.
      const knotRoom = Math.max(0, shown * W) - NOSE + G - 8 >= KNOT_SPAN * 0.42;
      const knotTarget = paused && started && !ended && !dragging && knotRoom ? 1 : 0;
      if (paused !== wasPaused) {
        if (paused) pausedAt = now;
        else if (started && wasStarted) pop(Math.max(minNose, shown * W), y0 - 30, 'GO!', C.bone, 26, now, 800);
        wasPaused = paused;
      }
      if (reduce) {
        knot = knotTarget;
        knotVel = 0;
      } else {
        const k = knotTarget ? 60 : 150;
        knotVel += (k * (knotTarget - knot) - 2 * Math.sqrt(k) * (knotTarget ? 0.8 : 1) * knotVel) * dt;
        knot += knotVel * dt;
      }
      const kn = Math.max(0, Math.min(1, knot));
      const e = ease(kn);
      const idle = e > 0.95 && !reduce; // chilling in the pause menu
      const idleT = (now - pausedAt) / 1000;

      // ---- pellets: one every `unit` seconds ----------------------------------------------------------------------
      let unit = PELLET_UNITS[PELLET_UNITS.length - 1];
      if (dur > 0) {
        for (const u of PELLET_UNITS) {
          if ((W * u) / dur >= PELLET_MIN_GAP) {
            unit = u;
            break;
          }
        }
      }
      const gap = dur > 0 ? (W * unit) / dur : W;
      const pelletCount = dur > 0 ? Math.floor((dur - 0.01) / unit) : 0;
      const nowEaten = ended ? pelletCount : Math.min(pelletCount, Math.floor((shown * dur) / unit + 1e-6));
      const noseRaw = Math.min(W - 2, Math.max(minNose, shown * W));
      // The knot is small early in the video and grows as the snake gets longer.
      // Near the start there is little room behind the head, so the knot shrinks to fit. The head never moves for it.
      const ks = Math.min(
        0.85 + 0.3 * shown,
        (H - T - 8) / (5.1 * KNOT_U), // never taller than the lane
        Math.max(0.42, (noseRaw - NOSE + G - 8) / KNOT_SPAN)
      );
      const noseFull = noseRaw;

      // Before the first play there is no snake on the lane. On play it comes in from the left with its mouth open,
      // lunges slightly past its place, and settles back.
      if (started && !wasStarted) {
        introAt = now;
        pop(30, y0 - 30, 'GO!', C.bone, 26, now, 900);
      }
      wasStarted = started;
      const hidden = !started && !ended;
      const introK = reduce ? 1 : Math.min(1, (now - introAt) / 700);
      const introBack = 1 + 2.2 * (introK - 1) ** 3 + 1.2 * (introK - 1) ** 2; // ease-out with a small overshoot
      const intro = introK < 1;
      const noseX = hidden ? -999 : intro ? -(G + 10) + (noseFull + G + 10) * introBack : noseFull;

      if (eaten < 0) eaten = nowEaten;
      if (nowEaten > eaten) {
        biteAt = now;
        const announce = now > quietUntil && !dragging && !intro && !ended;
        if (!reduce) burst(noseX, y0, announce ? 4 : 2, C.gold, now);
        if (announce) pop(noseX + 6, y0 - 20, `+${(nowEaten - eaten) * unit}`, C.gold, 17, now, 650);
        if (announce) score((nowEaten - eaten) * unit); // the HUD's score ticks when the snake has eaten
        eaten = nowEaten;
      } else if (nowEaten < eaten) {
        // Coughed back up: each pellet hops out of the mouth as the snake is pulled back past its place.
        for (let k = nowEaten + 1; k <= eaten; k++) spatAt.set(k, now);
        eaten = nowEaten;
      }

      // loaded pellets light up one after another
      const bufPellets = dur > 0 ? Math.min(pelletCount, Math.floor((buffer * dur) / unit + 0.01)) : 0;
      if (litF < 0 || reduce || bufPellets < litF) litF = bufPellets;
      else litF = Math.min(bufPellets, litF + dt * 22); // new pellets light up one after another
      const frontier = Math.floor(litF);
      const stillLoading = bufPellets < pelletCount;

      // ---- the bite: the jaw opens only when the pellet is close, the head lunges, snaps, and settles back ----------
      const intoGap = gap > 0 ? ((((shown * dur) / unit) % 1) + 1) % 1 : 0;
      const reaching =
        !paused && started && !dragging && springMode === 'normal' && eaten < pelletCount && intoGap > 0.8;
      const reach = Math.min(6, gap * 0.7);
      const sinceBite = now - biteAt;
      const lunge = reduce
        ? 0
        : Math.max(reaching ? ((intoGap - 0.8) / 0.2) ** 2 * reach : 0, sinceBite < 400 ? reach * Math.exp(-sinceBite / 80) : 0);

      // hover: pellets and the head swell under the cursor
      hov += ((pointing && !dragging && pointer !== null ? 1 : 0) - hov) * Math.min(1, dt * 12);
      const hoverX = pointer !== null ? pointer * W : -999;

      // ---- snake centreline, neck to tail -------------------------------------------------------------------------
      const boostT = (now - boostAt) / 1000;
      const coughT = (now - coughAt) / 1000;
      const winding = now < holdUntil;
      const jolt = winding && coughT < 0.2 ? Math.sin(now / 14) * 2 : 0;
      // Paused, it keeps trying to get free. Every few seconds: pull forward hard (the knot tightens, the neck
      // stretches, the head shakes), give up with a snap back (the knot springs loose), then rest and breathe.
      // It only struggles once it has come to rest in the knot. Any movement (play, a seek, a drag) cuts the
      // struggle off at once, and the next try starts a moment after the snake has settled again.
      const atRest = idle && paused && !dragging && springMode === 'normal' && speed < 4 && now >= holdUntil;
      if (!atRest) calmSince = now;
      const calmT = (now - calmSince) / 1000 - 0.7;
      const beatT = atRest && calmT >= 0 ? calmT % STRUGGLE : 99;
      const strain = beatT < 0.18 ? beatT / 0.18 : beatT < 1.05 ? 1 : beatT < 1.2 ? 1 - (beatT - 1.05) / 0.15 : 0;
      const recoil = beatT >= 1.2 && beatT < 1.9 ? Math.sin((beatT - 1.2) * 16) * Math.exp(-(beatT - 1.2) * 6) : 0;
      const pull = 9 * strain - 3 * recoil; // a steady pull: any buzz here shows as flicker in the packed knot
      const breathe = idle ? 1 + Math.sin(idleT * 1.9) * 0.02 - 0.06 * ease(strain) + 0.03 * recoil : 1;
      if (idle && beatT >= 1.2 && beatT < 1.2 + dt * 1.5) burst(noseX - NOSE * 0.4, y0 - 6, 5, C.bone, now, 2.6);

      const neckX = noseX - NOSE + jolt - (winding && boostT < 0.2 ? Math.sin((boostT / 0.17) * Math.PI) * 6 : 0);
      const kx = neckX - KNOT_HALF * KNOT_U * ks; // knot centre

      if (!reduce) phase += dt * (paused ? 1.1 : 7 * waveSpeed + Math.min(14, speed / 40));
      const amp = reduce ? 0 : 2.3 * waveAmp * (1 - e) * (paused ? 0.3 : 1);

      const straightLen = Math.max(30, neckX + G + 34); // the body runs off the left edge of the lane
      const total = straightLen + KNOT_EXTRA * ks * e;
      const gulpT = (now - gulpStart) / 1000;
      const pts: { x: number; y: number; w: number; d: number }[] = [];
      for (let d = 0; d <= total + STEP; d += STEP) {
        const dd = Math.min(d, total);
        // straight pose
        let sx = neckX - dd + lunge * Math.exp(-dd / 22) * (1 - e); // the neck stretches into the lunge
        let sy = y0 + Math.sin(dd * 0.085 - phase) * amp * Math.min(1, dd / 40);
        // knotted pose
        if (e > 0) {
          let qx: number;
          let qy: number;
          if (dd < KNOT.length * ks) {
            const f = dd / (STEP * ks);
            const i0 = Math.min(KNOT.pts.length - 1, Math.floor(f));
            const i1 = Math.min(KNOT.pts.length - 1, i0 + 1);
            const a = KNOT.pts[i0];
            const b = KNOT.pts[i1];
            const t = f - Math.floor(f);
            // the pull is strongest at the head and dies away into the knot
            qx = kx + (a.x + (b.x - a.x) * t) * breathe * ks + pull * Math.exp(-dd / 46);
            // the trefoil hangs lower than it rises: lift its middle so the knot sits centred on the lane
            const lift = 0.47 * KNOT_U * ks * Math.max(0, Math.min(1, dd / 36, (KNOT.length * ks - dd) / 36));
            qy = y0 + (a.y + (b.y - a.y) * t) * breathe * ks - lift;
          } else {
            const rest = dd - KNOT.length * ks;
            qx = kx - KNOT_HALF * KNOT_U * ks - rest;
            // the free tail sways a little while idling
            qy = y0 + (idle ? Math.sin(rest * 0.07 - idleT * 2.2) * 2.2 * Math.min(1, rest / 30) : 0);
          }
          const el = ease(Math.max(0, Math.min(1, kn * 2.2 - Math.min(1, dd / (KNOT.length * ks)) * 1.2)));
          sx += (qx - sx) * el;
          sy += (qy - sy) * el;
        }
        // taper the last 36px into a tail; thicken where a gulp bulge is passing
        let w = T * Math.min(1, 0.22 + (total - dd) / 36);
        if (!reduce && gulpT >= 0 && gulpT < 1.4) {
          const bulgeD = 12 + gulpT * Math.max(140, total) * 0.75;
          w += 6 * Math.exp(-(((dd - bulgeD) / 10) ** 2)) * (1 - gulpT / 1.4);
        }
        pts.push({ x: sx, y: sy, w, d: dd });
      }

      // ---- draw: lane ---------------------------------------------------------------------------------------------
      ctx.clearRect(-G, 0, W + G, H);
      ctx.imageSmoothingEnabled = true;

      // ---- the start of the lane: a short run-up, then a chequered start line at 0:00 -----------------------------
      ctx.fillStyle = 'rgba(236,232,223,0.5)';
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 2; col++) {
          if ((row + col) % 2 === 0) ctx.fillRect(-7 + col * 3, y0 - 9 + row * 3, 3, 3);
        }
      }
      // The run-up: a few pellets before the start line. They are not video time, just the snake's
      // first bites: on START it comes in with its mouth open and eats them on the way to 0:00.
      if (hidden || intro) {
        const runGap = Math.max(8, Math.min(14, gap));
        let passed = 0;
        for (let j = 1; -j * runGap > -G + 8; j++) {
          const rx = -j * runGap;
          if (!hidden && rx <= noseX - 6) {
            passed++;
            continue;
          }
          const big = j % 5 === 0;
          const size = big ? 6 : 4;
          ctx.save();
          ctx.shadowColor = C.gold;
          ctx.shadowBlur = 0;
          ctx.fillStyle = C.gold;
          ctx.fillRect(Math.round(rx - size / 2), Math.round(y0 - size / 2), size, size);
          ctx.restore();
        }
        if (intro && passed > runEaten) {
          biteAt = now;
          if (!reduce) burst(noseX, y0, 3, C.gold, now);
        }
        runEaten = hidden ? 0 : passed;
      }

      // stage gates: a flagged post where each chapter starts; passed ones turn gold
      const shownSec = shown * dur;
      let nowStage = 0;
      for (let i = 0; i < stages.length; i++) if (shownSec >= stages[i].start - 0.05) nowStage = i;
      if (stage >= 0 && nowStage > stage && now > quietUntil && !intro && !hidden && gates) {
        const gx = (stages[nowStage].start / dur) * W;
        for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].text.startsWith('STAGE')) floaters.splice(i, 1);
        pop(gx, y0 - 34, `STAGE ${nowStage + 1}`, C.goldHot, 22, now, 1300);
        if (!reduce) burst(gx, y0 - 20, 12, C.goldHot, now);
      }
      stage = nowStage;
      const flagNumbers: { x: number; y: number; n: number }[] = [];
      if (gates && dur > 0) {
        for (let i = 1; i < stages.length; i++) {
          const gx = Math.round((stages[i].start / dur) * W);
          const passed = i <= nowStage;
          const top = y0 - 30;
          ctx.fillStyle = passed ? C.gold : 'rgba(236,232,223,0.55)';
          ctx.fillRect(gx - 1, top, 2, y0 + 14 - top); // post
          ctx.fillRect(gx - 4, y0 + 13, 8, 3); // foot
          ctx.fillRect(gx + 1, top, 15, 13); // flag
          flagNumbers.push({ x: gx + 8.5, y: top + 7, n: i + 1 });
        }
      }

      // pellets
      const inMouth: { px: number; py: number; size: number; color: string }[] = [];
      for (let k = Math.max(1, eaten + 1); k <= pelletCount; k++) {
        const px = ((k * unit) / dur) * W;
        if (px <= noseX + lunge - 8) continue; // swallowed: well inside the head
        let py = y0;
        let s = 1;
        const spat = spatAt.get(k);
        if (spat !== undefined) {
          const t = (now - spat) / 320;
          if (t >= 1 || reduce) spatAt.delete(k);
          else {
            py = y0 - Math.sin(t * Math.PI) * 16; // hop out of the mouth
            s = 0.5 + t * 0.5 + Math.sin(t * Math.PI) * 0.5;
          }
        }
        const lit = k <= frontier;
        const big = k % 5 === 0;
        const mag = hov > 0.01 && !reduce ? 1 + 1.1 * hov * Math.exp(-(((px - hoverX) / 30) ** 2)) : 1;
        // capped so neighbours never merge into one bar
        let size = Math.min((lit ? (big ? 6 : 4) : big ? 4 : 2.5) * s * mag, Math.max(6, gap * 1.35));
        let color = lit ? C.gold : 'rgba(236,232,223,0.55)';
        let glow = lit ? 6 : 0;
        // just lit: a short white flash, one pellet after another
        const since = litF - k;
        if (lit && since < 3 && !reduce && stillLoading) {
          size += (3 - since) * 0.9;
          color = C.goldHot;
          glow = 12;
        }
        // the last loaded pellet blinks while more is loading
        if (lit && k === frontier && stillLoading) {
          const on = reduce || Math.floor(now / 260) % 2 === 0;
          size = on ? size + 1 : size;
          color = on ? C.goldHot : C.gold;
          glow = on ? 14 : 4;
        }
        // A pellet at the mouth is drawn after the head, so it is seen between the jaws until the bite takes it.
        if (px <= noseX + lunge + 4 && !hidden) {
          inMouth.push({ px, py, size, color });
          continue;
        }
        ctx.save();
        ctx.shadowColor = C.gold;
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(px - size / 2), Math.round(py - size / 2), Math.round(size), Math.round(size));
        ctx.restore();
      }

      // bait: ghost square under the pointer; solid while dragging
      if (pointer !== null && (pointing || dragging)) {
        const bx = pointer * W;
        ctx.save();
        ctx.strokeStyle = C.gold;
        ctx.fillStyle = C.gold;
        ctx.lineWidth = 2;
        ctx.shadowColor = C.gold;
        ctx.shadowBlur = 0;
        if (dragging) ctx.fillRect(bx - 6, y0 - 6, 12, 12);
        else ctx.strokeRect(bx - 6, y0 - 6, 12, 12);
        ctx.restore();
      }

      if (hidden) {
        buf.present(out, PIXEL * dprNow);
        root.style.setProperty('--coil-head-x', `${minNose * K}px`);
        root.style.setProperty('--coil-head-y', `${y0 * K}px`);
        return;
      }

      // ---- draw: boost ------------------------------------------------------------------------------------------
      const boosting = !reduce && boostT >= 0 && boostT < 1.1;
      const boostGlow = boosting ? (boostT < 0.17 ? boostT / 0.17 : Math.max(0, 1 - (boostT - 0.17) / 0.9)) : 0;
      if (boosting && boostT < 0.2) {
        // power-up: a ring closes in on the head
        const r = 34 * (1 - boostT / 0.2) + 10;
        ctx.strokeStyle = C.goldHot;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.9;
        ctx.strokeRect(neckX + NOSE / 2 - r, y0 - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
      }
      if ((boosting && speed > 120) || (intro && introK < 0.5)) {
        // speed lines streaming back off the snake
        ctx.fillStyle = C.goldHot;
        for (let i = 0; i < 9; i++) {
          const ly = y0 + (((i * 37) % 44) - 22);
          const lx = neckX - 20 - ((now / 3 + i * 53) % 150);
          ctx.globalAlpha = intro ? 0.45 : Math.min(0.8, speed / 900);
          ctx.fillRect(Math.round(lx), Math.round(ly), 14 + ((i * 13) % 26), 2);
        }
        ctx.globalAlpha = 1;
        trail.push({ x: neckX, at: now });
      }
      while (trail.length && (now - trail[0].at > 220 || trail.length > 10)) trail.shift();

      // ---- draw: snake --------------------------------------------------------------------------------------------
      ctx.lineJoin = 'round';
      const seg = (i: number, width: number, color: string, offset = 0, cap: CanvasLineCap = 'butt', back = 0) => {
        const a = pts[i];
        const b = pts[i + 1];
        const tx = b.x - a.x;
        const ty = b.y - a.y;
        const len = Math.hypot(tx, ty) || 1;
        // offset is toward the back of the snake (up, on the straight body)
        const ox = (-ty / len) * offset;
        const oy = (tx / len) * offset;
        ctx.lineCap = cap;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a.x + ox, a.y + oy);
        // `back` runs the stroke a little into the segment drawn before it, so no seam shows
        ctx.lineTo(b.x + ox + (tx / len) * back, b.y + oy + (ty / len) * back);
        ctx.stroke();
      };

      const last = pts.length - 2;
      if (boostGlow > 0) {
        ctx.save();
        ctx.globalAlpha = 0.9 * boostGlow;
        ctx.shadowColor = C.gold;
        ctx.shadowBlur = 0;
        for (let i = last; i >= 0; i -= 2) seg(i, pts[i + 1].w + 8, C.gold, 0, 'round');
        ctx.restore();
      }

      // Painter order, tail to head: where the body crosses itself, the strand nearer the head is drawn later, on top.
      // The sheen and the bands are placed by distance from the head, so the pattern runs unbroken through the knot.
      const sheenShift = phase * 14;
      // one continuous light edge, so the black body reads against the dark lane
      ctx.lineCap = 'round';
      ctx.strokeStyle = C.rim;
      ctx.lineWidth = T + 5;
      ctx.beginPath();
      for (let i = 0; i <= last - 12; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i].x, pts[i].y);
      ctx.stroke();
      for (let i = last; i >= 0; i--) {
        const w = pts[i + 1].w;
        const d = pts[i].d;
        // butt caps: an outline must not reach back over the skin of the segment drawn just before it
        seg(i, w + 3, C.ink, 0, 'butt', 1.6);
        seg(i, w, C.scale1, 0, 'butt', 2);
        seg(i, w * 0.5, C.scale2, w * 0.16, 'butt', 2);
        const band = ((d % BAND_EVERY) + BAND_EVERY) % BAND_EVERY < 3.2;
        const si = Math.floor(((((d - sheenShift) / SHEEN_PERIOD) % 1) + 1) * 96) % 96;
        seg(i, Math.max(2, w * 0.26), SHEEN[si], w * 0.24, 'butt', 2);
        if (band && w > 6) {
          ctx.globalAlpha = Math.min(1, d / 34); // the pattern fades in behind the head
          seg(i, w * 0.92, C.band, 0, 'butt');
          ctx.globalAlpha = 1;
        }
      }

      // ---- head: drawn from the same layers as the body, so there is no join at the neck ---------------------------
      let pose: Pose = 'rest';
      if (winding || intro || speed > 160 || (dragging && speed > 50)) pose = 'strike';
      else if (coughT >= 0 && coughT < 0.5) pose = 'strike';
      else if (e > 0.6) {
        // knotted: it strains against the knot, and flicks its tongue while it rests between tries
        const beat = beatT;
        pose = strain > 0.2 ? 'strain' : idle && ((beat > 1.7 && beat < 1.88) || (beat > 2.02 && beat < 2.2)) ? 'tongue' : 'rest';
      } else if (waiting && !reduce && Math.floor(now / 520) % 2 === 0) pose = 'tongue';
      else if (reaching) pose = 'strike'; // jaw opens only as it lunges for the pellet
      const n0 = pts[0];
      const n1 = pts[Math.min(pts.length - 1, 2)];
      const angle = Math.atan2(n0.y - n1.y, n0.x - n1.x);
      const headHover = reduce ? 0 : hov * Math.exp(-(((hoverX - (noseX - NOSE / 2)) / 44) ** 2));
      const bite = (reduce ? 1 : 1 + 0.16 * Math.exp(-(now - biteAt) / 90)) + 0.16 * headHover;
      // straining: the head shakes from side to side as it pulls
      const shake = strain > 0 ? Math.sin(now / 70) * 0.08 * strain : 0; // only the head shakes, slowly
      const sway = atRest ? Math.sin(idleT * 1.3) * 0.05 * (1 - strain) + shake : 0;
      const jawOpen = pose === 'strike' ? 1 : pose === 'strain' ? 0.22 + 0.1 * Math.sin(now / 60) : 0;
      let face: { x: number; y: number; rot: number; scale: number; jaw: number; tongue: boolean; narrow: boolean } | null = null;
      const drawHead = (x: number, y: number, alpha: number) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        const rot = angle + sway - (0.05 + 0.1 * Math.min(1, jawOpen)) * (1 - e);
        ctx.rotate(rot);
        ctx.scale(bite, bite);
        if (alpha === 1) face = { x, y, rot, scale: bite, jaw: jawOpen, tongue: pose === 'tongue', narrow: pose === 'strain' };
        paintHead(ctx, {
          T,
          jaw: jawOpen,
          tongue: pose === 'tongue',
          narrow: pose === 'strain',
          outline: alpha === 1,
          bare: true,
          sheenAt: (d) => SHEEN[Math.floor(((((d - sheenShift) / SHEEN_PERIOD) % 1) + 1) * 96) % 96],
          bandAt: (d) => ((d % BAND_EVERY) + BAND_EVERY) % BAND_EVERY < 3.2,
          colors: C,
        });
        ctx.restore();
      };
      for (let i = 0; i < trail.length; i++) drawHead(trail[i].x, n0.y, 0.08 + (i / trail.length) * 0.22); // after-images
      drawHead(n0.x, n0.y, 1);
      for (const m of inMouth) {
        ctx.fillStyle = m.color;
        ctx.fillRect(Math.round(m.px - m.size / 2), Math.round(m.py - m.size / 2), Math.round(m.size), Math.round(m.size));
      }

      // cough: a puff out of the mouth
      if (!reduce && coughT >= 0 && coughT < 0.05) burst(n0.x + NOSE, y0, 3, C.bone, now, 1.2, 0);

      // ---- effects ------------------------------------------------------------------------------------------------
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const t = (now - p.born) / p.life;
        if (t >= 1) {
          particles.splice(i, 1);
          continue;
        }
        p.vy += 260 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;

      const sBuf = K / PIXEL;
      buf.present(out, PIXEL * dprNow, (art) => {
        if (!face) return;
        const f = face;
        const cs = Math.cos(f.rot) * f.scale * T;
        const sn = Math.sin(f.rot) * f.scale * T;
        drawPixelFace(
          (lx, ly) => [Math.round((f.x + lx * cs - ly * sn + G) * sBuf), Math.round((f.y + lx * sn + ly * cs) * sBuf)],
          (x, y, colour) => {
            art.fillStyle = colour;
            art.fillRect(x, y, 1, 1);
          },
          { jaw: f.jaw, tongue: f.tongue, narrow: f.narrow, big: T * f.scale * sBuf >= 8, colors: C }
        );
      });
      out.font = `400 13px ${FONT}`;
      out.textAlign = 'center';
      out.textBaseline = 'middle';
      out.fillStyle = C.ink;
      for (const f of flagNumbers) out.fillText(String(f.n), f.x, f.y);

      out.textAlign = 'center';
      out.textBaseline = 'alphabetic';
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        const t = (now - f.born) / f.life;
        if (t >= 1) {
          floaters.splice(i, 1);
          continue;
        }
        const rise = reduce ? 0 : (1 - (1 - t) * (1 - t)) * 16;
        const scale = reduce ? 1 : t < 0.12 ? 0.6 + (t / 0.12) * 0.55 : 1.15 - Math.min(0.15, (t - 0.12) * 1.2);
        const x = Math.max(24, Math.min(W - 24, f.x));
        out.save();
        out.translate(x, Math.min(H - 4, Math.max(f.size, f.y - rise)));
        out.scale(scale, scale);
        out.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
        out.font = `400 ${f.size}px ${FONT}`;
        out.lineWidth = 4;
        out.strokeStyle = C.ink;
        out.strokeText(f.text, 0, 0);
        out.fillStyle = f.color;
        out.fillText(f.text, 0, 0);
        out.restore();
      }

      // head position for the focus ring on the real slider thumb
      root.style.setProperty('--coil-head-x', `${(n0.x + NOSE / 2) * K}px`);
      root.style.setProperty('--coil-head-y', `${n0.y * K}px`);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="coil-snake" aria-hidden="true" />;
}
