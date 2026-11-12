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
import { useEffect, useRef } from 'react';

import headRest from './assets/head-rest.svg?url';
import headStrain from './assets/head-strain.svg?url';
import headStrike from './assets/head-strike.svg?url';
import headTongue from './assets/head-tongue.svg?url';

type Pose = 'rest' | 'strain' | 'strike' | 'tongue';

const HEAD_SRC: Record<Pose, string> = { rest: headRest, strain: headStrain, strike: headStrike, tongue: headTongue };

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
const T = 12;
const HEAD_SCALE = T / 24;
const HEAD_W = 96 * HEAD_SCALE;
const HEAD_H = 64 * HEAD_SCALE;
const NOSE = 80 * HEAD_SCALE; // neck socket to nose tip
const NECK_Y = 32 * HEAD_SCALE; // socket centre

const STEP = 2.5;
const PELLET_MIN_GAP = 7;
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
  const live = useRef({ paused, ended, waiting, duration, started, volume, muted });
  live.current = { paused, ended, waiting, duration, started, volume, muted };

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = canvas?.parentElement;
    if (!canvas || !root) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const heads = {} as Record<Pose, HTMLImageElement>;
    (Object.keys(HEAD_SRC) as Pose[]).forEach((p) => {
      const img = new Image();
      img.src = HEAD_SRC[p];
      heads[p] = img;
    });

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    let W = 0;
    let H = 0;
    const resize = () => {
      const r = root.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      const { paused, ended, waiting, duration, started, volume, muted } = live.current;
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
      const minNose = NOSE + 26;

      // ---- seeks: boost forward, cough backward -----------------------------------------------------------------
      // While the head is dragged, the snake follows the pointer: forward eats, backward coughs pellets back up.
      const target = ended ? 1 : dragging && pointer !== null ? pointer : fill;
      if (lastTarget >= 0 && !dragging) {
        const jumpSec = (target - lastTarget) * dur;
        if (Math.abs(jumpSec) >= 3) {
          quietUntil = now + 900;
          const from = Math.max(minNose, shown * W);
          if (jumpSec > 0) {
            boostAt = now;
            gulpStart = now + 170;
            springMode = 'boost';
            pop(from + 10, y0 - 30, `+${snap(jumpSec)}`, C.gold, 30, now, 1200);
            pop(from + 10, y0 + 40, 'BOOST', C.goldHot, 18, now, 800);
          } else {
            coughAt = now;
            springMode = 'recoil';
            pop(from, y0 - 30, `-${snap(-jumpSec)}`, C.red, 30, now, 1200);
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
      const knotTarget = paused && started && !ended && !dragging ? 1 : 0;
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
      // While knotted near the start, slide right far enough for the whole knot to fit on the lane.
      const noseRaw = Math.min(W - 2, Math.max(minNose, shown * W));
      // The knot is small early in the video and grows as the snake gets longer.
      const ks = 0.85 + 0.3 * shown;
      const noseFull = noseRaw + Math.max(0, KNOT_SPAN * ks + NOSE + 34 - noseRaw) * e;

      // Before the first play there is no snake on the lane. On play it comes in from the left with its mouth open,
      // lunges slightly past its place, and settles back.
      if (started && !wasStarted) {
        introAt = now;
        pop(minNose + 20, y0 - 30, 'GO!', C.bone, 26, now, 900);
      }
      wasStarted = started;
      const hidden = !started && !ended;
      const introK = reduce ? 1 : Math.min(1, (now - introAt) / 700);
      const introBack = 1 + 2.2 * (introK - 1) ** 3 + 1.2 * (introK - 1) ** 2; // ease-out with a small overshoot
      const intro = introK < 1;
      const noseX = hidden ? -999 : intro ? -40 + (noseFull + 40) * introBack : noseFull;

      if (eaten < 0) eaten = nowEaten;
      if (nowEaten > eaten) {
        biteAt = now;
        const announce = now > quietUntil && !dragging && !intro && !ended;
        if (!reduce) burst(noseX, y0, announce ? 4 : 2, C.gold, now);
        if (announce) pop(noseX + 6, y0 - 20, `+${(nowEaten - eaten) * unit}`, C.gold, 17, now, 650);
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
      const breathe = idle ? 1 + Math.sin(idleT * 1.9) * 0.022 : 1;

      const neckX = noseX - NOSE + jolt - (winding && boostT < 0.2 ? Math.sin((boostT / 0.17) * Math.PI) * 6 : 0);
      const kx = neckX - KNOT_HALF * KNOT_U * ks; // knot centre

      if (!reduce) phase += dt * (paused ? 1.1 : 7 * waveSpeed + Math.min(14, speed / 40));
      const amp = reduce ? 0 : 2.3 * waveAmp * (1 - e) * (paused ? 0.3 : 1);

      const straightLen = Math.max(30, neckX);
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
            qx = kx + (a.x + (b.x - a.x) * t) * breathe * ks;
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
      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true;

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
        let color = lit ? C.gold : 'rgba(236,232,223,0.36)';
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
          size = on ? size + 2 : size;
          color = on ? C.goldHot : C.gold;
          glow = on ? 14 : 4;
          ctx.strokeStyle = C.gold;
          ctx.lineWidth = 1;
          ctx.globalAlpha = on ? 0.9 : 0.35;
          ctx.strokeRect(Math.round(px - 6) + 0.5, Math.round(py - 6) + 0.5, 11, 11);
          ctx.globalAlpha = 1;
        }
        // A pellet at the mouth is drawn after the head, so it is seen between the jaws until the bite takes it.
        if (px <= noseX + lunge + 4 && !hidden) {
          inMouth.push({ px, py, size, color });
          continue;
        }
        ctx.save();
        ctx.shadowColor = C.gold;
        ctx.shadowBlur = glow;
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
        ctx.shadowBlur = dragging ? 12 : 5;
        if (dragging) ctx.fillRect(bx - 6, y0 - 6, 12, 12);
        else ctx.strokeRect(bx - 6, y0 - 6, 12, 12);
        ctx.restore();
      }

      if (hidden) {
        root.style.setProperty('--coil-head-x', `${minNose}px`);
        root.style.setProperty('--coil-head-y', `${y0}px`);
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
        ctx.globalAlpha = 0.5 * boostGlow;
        ctx.shadowColor = C.gold;
        ctx.shadowBlur = 16;
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
        const nk = Math.min(1, d / 40);
        ctx.globalAlpha = 0.3 + 0.7 * nk;
        seg(i, w * 0.5, C.scale2, w * 0.16, 'butt', 2);
        ctx.globalAlpha = 1;
        if (nk < 1) seg(i, w, `rgba(10,11,13,${(0.3 * (1 - nk)).toFixed(3)})`, 0, 'butt', 2);
        const band = (((d + sheenShift * 0.15) % BAND_EVERY) + BAND_EVERY) % BAND_EVERY < 3.2;
        const si = Math.floor(((((d - sheenShift) / SHEEN_PERIOD) % 1) + 1) * 96) % 96;
        ctx.globalAlpha = 0.4 + 0.6 * Math.min(1, d / 36);
        seg(i, Math.max(2, w * 0.26), SHEEN[si], w * 0.24, 'butt', 2);
        ctx.globalAlpha = 1;
        if (band && w > 6 && d > 22) seg(i, w * 0.92, C.band, 0, 'butt');
      }

      // the body carries on a few px under the head
      {
        const a = pts[0];
        const b = pts[1];
        const len = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        ctx.lineCap = 'butt';
        ctx.strokeStyle = '#262c35';
        ctx.lineWidth = T;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + ((a.x - b.x) / len) * 7, a.y + ((a.y - b.y) / len) * 7);
        ctx.stroke();
      }

      // ---- head ---------------------------------------------------------------------------------------------------
      let pose: Pose = 'rest';
      if (winding || intro || speed > 160 || (dragging && speed > 50)) pose = 'strike';
      else if (coughT >= 0 && coughT < 0.5) pose = 'strike';
      else if (e > 0.6) {
        // idling: a slow tongue flick now and then
        const beat = idleT % 2.8;
        pose = idle && ((beat > 0.2 && beat < 0.38) || (beat > 0.52 && beat < 0.7)) ? 'tongue' : 'rest';
      } else if (waiting && Math.floor(now / 520) % 2 === 0) pose = 'tongue';
      else if (reaching) pose = 'strike'; // jaw opens only as it lunges for the pellet
      const img = heads[pose].complete ? heads[pose] : heads.rest;
      const n0 = pts[0];
      const n1 = pts[Math.min(pts.length - 1, 4)];
      const angle = Math.atan2(n0.y - n1.y, n0.x - n1.x);
      const headHover = reduce ? 0 : hov * Math.exp(-(((hoverX - (noseX - NOSE / 2)) / 44) ** 2));
      const bite = (reduce ? 1 : 1 + 0.16 * Math.exp(-(now - biteAt) / 90)) + 0.16 * headHover;
      const sway = idle ? Math.sin(idleT * 1.3) * 0.07 : 0;
      const bob = idle ? Math.sin(idleT * 1.9) * 1.2 : 0;
      const drawHead = (x: number, y: number, alpha: number) => {
        if (!img.complete || !img.naturalWidth) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y + bob);
        ctx.rotate(angle * 0.6 + sway);
        ctx.scale(bite, bite);
        if (alpha === 1) {
          // the same dark edge and light rim as the body, on every side except the neck
          const px = canvas.width / W;
          ctx.shadowBlur = 0;
          for (const [color, r] of [[C.rim, 2.5], [C.ink, 1.5]] as const) {
            ctx.shadowColor = color;
            for (const [ox, oy] of [[1, 0], [0, 1], [0, -1], [0.7, 0.7], [0.7, -0.7]]) {
              ctx.shadowOffsetX = ox * r * px;
              ctx.shadowOffsetY = oy * r * px;
              ctx.drawImage(img, -1.5, -NECK_Y, HEAD_W, HEAD_H);
            }
          }
          ctx.shadowColor = 'transparent';
        }
        ctx.drawImage(img, -1.5, -NECK_Y, HEAD_W, HEAD_H);
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

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
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
        ctx.save();
        ctx.translate(x, Math.min(H - 4, Math.max(f.size, f.y - rise)));
        ctx.scale(scale, scale);
        ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
        ctx.font = `400 ${f.size}px ${FONT}`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = C.ink;
        ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, 0, 0);
        ctx.restore();
      }

      // head position for the focus ring on the real slider thumb
      root.style.setProperty('--coil-head-x', `${n0.x + NOSE / 2}px`);
      root.style.setProperty('--coil-head-y', `${n0.y}px`);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="coil-snake" aria-hidden="true" />;
}
