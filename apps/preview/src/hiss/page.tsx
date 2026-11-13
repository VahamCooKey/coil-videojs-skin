import { MuxVideo } from '@videojs/react/media/mux-video';
import { VideoPlayer } from '@videojs/react/video';
import { type CSSProperties, type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { CoilIdleSnake } from '@/video/coil/coil-idle';
import { VideoSkin } from '@/video/skin';

import { ditherEdge, PixelSky, type Sky } from './pixel-sky';
import { ScrollSnake } from './scroll-snake';

// The film on this page: Ganesh's 2026 showreel, hosted on Mux (public playback ID).
export const PLAYBACK_ID = 'cIfeUUvOtvTx4u1vBjo1lPse00cqzO7TDxrDEX9DFUgE';
const SRC = `https://stream.mux.com/${PLAYBACK_ID}.m3u8`;
const POSTER = `https://image.mux.com/${PLAYBACK_ID}/thumbnail.webp?time=2.2&width=1920`;
const img = (name: string) => `./hiss/${name}.webp`;
const clip = (name: string) => ({ src: `./hiss/clips/${name}.mp4`, poster: `./hiss/clips/${name}.webp` });

const SITE = 'https://ganeshdg.com';
const LINKS = [
  ['Portfolio', SITE],
  ['LinkedIn', 'https://www.linkedin.com/in/ganeshdg6'],
  ['Instagram', 'https://www.instagram.com/ganeshinmotion'],
] as const;

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Sections double as the stages on the top-bar lane. */
export const STAGES = [
  ['play', 'How to play'],
  ['stages', 'Stages'],
  ['console', 'Console'],
  ['system', 'System'],
  ['access', 'Access'],
] as const;
const STAGE_IDS = STAGES.map(([id]) => id);

/** The move list. Every clip is the real skin playing the showreel; the cursor and key caps show what was pressed. */
const MOVES = [
  { clip: 'start', name: 'PRESS START', reads: 'first play', text: 'A coiled snake idles over the poster. Press START and it lunges onto the lane with its mouth open.' },
  { clip: 'eat', name: 'EAT', reads: 'current time', text: 'Each pellet is a stretch of the video: one second on a short clip, up to five minutes on a long film. The head bites each one it reaches and SCORE ticks over.' },
  { clip: 'drag', name: 'DRAG', reads: 'seeking', text: 'Grab the head and drag it. Pull back and the snake coughs the pellets onto the lane again; push forward and it swallows them.' },
  { clip: 'boost', name: 'BOOST', reads: 'seek forward', text: '+10 on the D-pad dashes the snake ahead, swallowing every pellet it passes. -10 sends it back.' },
  { clip: 'hover', name: 'SCOUT', reads: 'pointer on the lane', text: 'Point at the lane for a preview frame, the time and the chapter name at that spot.' },
  { clip: 'paused', name: 'PAUSE', reads: 'paused', text: 'A pauses. The frame dims under a pause panel with SCORE and GOAL, and the snake ties itself in a knot.' },
  { clip: 'knot', name: 'KNOT', reads: 'paused, left alone', text: 'Leave it paused and the knotted snake strains, shakes and gives up. Any press cuts the struggle short.' },
  { clip: 'volume', name: 'VOLUME', reads: 'volume', text: 'Louder sound makes a bigger, faster wave down the snake’s body; quieter calms it. The meter in the corner appears on the picture.' },
  { clip: 'captions', name: 'CAPTIONS', reads: 'text track', text: 'CC turns on notes about each piece in the reel, set in the pixel face on a solid plate.' },
  { clip: 'menu', name: 'MENU', reads: 'settings', text: 'The settings open like an in-game menu. The arrow cursor follows the arrow keys and Escape backs out.' },
  { clip: 'loading', name: 'LOADING', reads: 'waiting for data', text: 'A snake chases its own tail on the screen. Pellets light up as the video loads, and the last one blinks.' },
  { clip: 'clear', name: 'STAGE CLEAR', reads: 'ended', text: 'Every pellet is gone. The panel counts the time and stages cleared, and A becomes PLAY AGAIN.' },
  { clip: 'gameover', name: 'GAME OVER', reads: 'error', text: 'The video failed. The console dims and CONTINUE? retries. Screen readers hear the full error message.' },
];

/** The other layouts, shown one at a time under the player. */
const ALSO = [
  { clip: 'portrait', frame: 'phone', name: 'Phone, upright', text: 'The pad stacks under a 60 px lane, and the snake draws at 70% so more pellets fit.' },
  { clip: 'landscape', frame: 'hand', name: 'Phone, sideways', text: 'A handheld: picture in the middle, A and B under the left thumb, the D-pad under the right.' },
  { clip: 'fullscreen', frame: 'tv', name: 'Fullscreen, desktop', text: 'A thin HUD on top, the lane and keys in one row below. Both hide when the mouse rests.' },
];

/** The showreel's chapters, as in showreel-chapters.vtt. */
const CHAPTERS = [
  { t: 0, name: 'Motion Design' },
  { t: 6.4, name: 'Product Film' },
  { t: 9.2, name: 'Kiosk Interface' },
  { t: 18.2, name: 'Short-Form Videos' },
  { t: 27, name: 'Automated Videos' },
  { t: 31.7, name: '3D Character' },
  { t: 35.4, name: 'AI Product Launch' },
  { t: 43, name: 'Ad Compositing' },
];

/** What the game shows for each player state. */
const RULES = [
  ['Time watched', 'The snake’s body', 'Grows one pellet at a time'],
  ['Playhead', 'The head', 'Always on the true time, from 0:00'],
  ['Buffered', 'Lit pellets', 'Dark pellets have not loaded yet'],
  ['Seek forward', 'BOOST', 'Dashes, swallowing what it passes'],
  ['Seek back', 'Cough', 'Spits pellets back and recoils'],
  ['Paused', 'PAUSED + knot', 'Ties itself up until you press A'],
  ['Waiting', 'LOADING', 'Chases its tail on the screen'],
  ['Ended', 'STAGE CLEAR', 'Lane empty, PLAY AGAIN'],
  ['Error', 'GAME OVER', 'CONTINUE? retries the source'],
  ['Chapters', 'Stages', 'Flags on the lane, name in the HUD'],
  ['Volume', 'Body wave', 'Louder sound, bigger wave'],
] as const;

/**
 * Parts of the console. x and y are the spot on the picture (percent); the number sits outside the picture on
 * `side`, joined to the spot by a line.
 */
const PARTS: { x: number; y: number; side: 'l' | 'r' | 't' | 'b'; name: string; job: string }[] = [
  { x: 2, y: 4.2, side: 'l', name: 'SCORE', job: 'Current time on digit tiles. The bar under it fills as the video plays.' },
  { x: 50, y: 2, side: 't', name: 'STAGE', job: 'The current chapter. Press it to show or hide the chapter flags.' },
  { x: 98, y: 4.2, side: 'r', name: 'GOAL', job: 'Length of the video.' },
  { x: 2, y: 38, side: 'l', name: 'SCREEN', job: 'The video. Click or tap it to play and pause.' },
  { x: 2, y: 75.5, side: 'l', name: 'LANE', job: 'The seek bar. The head is the playhead: click, drag, or use the arrow keys.' },
  { x: 2.5, y: 88.5, side: 'l', name: 'A / B', job: 'A plays and pauses. B mutes.' },
  { x: 50.8, y: 94, side: 'b', name: 'OPTIONS', job: 'Captions, settings, picture in picture, fullscreen.' },
  { x: 97.5, y: 90, side: 'r', name: 'D-PAD', job: 'Left and right jump 10 seconds. Up and down set the volume.' },
];

const PALETTE = [
  { hex: '#14171b', name: 'Case', role: 'Console body' },
  { hex: '#1d2127', name: 'Panel', role: 'Keys, HUD wells' },
  { hex: '#2c323a', name: 'Edge', role: 'Bevels (decor only)' },
  { hex: '#ece8df', name: 'Bone', role: 'Text, icons · 14.7:1' },
  { hex: '#a7a399', name: 'Dim', role: 'Legends · 7.1:1' },
  { hex: '#ffb21e', name: 'Gold', role: 'Live, pressable, focus · 10.0:1' },
  { hex: '#ff4d3d', name: 'Red', role: 'Muted, GAME OVER · 5.5:1' },
  { hex: '#0a0b0d', name: 'Ink', role: 'Text on gold · 10.9:1' },
];

/** Keyboard map, from the skin's own hotkeys. `match` lists the KeyboardEvent.key values that light the row. */
const KEYS: { keys: string; what: string; match: string[] }[] = [
  { keys: 'Space · A', what: 'Play or pause (K too)', match: [' ', 'a', 'k'] },
  { keys: 'M · B', what: 'Mute or unmute', match: ['m', 'b'] },
  { keys: '← →', what: 'Seek back or forward (J L too)', match: ['ArrowLeft', 'ArrowRight', 'j', 'l'] },
  { keys: '↑ ↓', what: 'Volume', match: ['ArrowUp', 'ArrowDown'] },
  { keys: '0 to 9', what: 'Jump to 0% to 90%', match: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] },
  { keys: 'F', what: 'Fullscreen', match: ['f'] },
  { keys: 'C', what: 'Captions', match: ['c'] },
  { keys: 'I', what: 'Picture in picture', match: ['i'] },
  { keys: '< >', what: 'Slower or faster', match: ['<', '>'] },
];

const keyName = (k: string) => (k === ' ' ? 'SPACE' : k.startsWith('Arrow') ? k.slice(5).toUpperCase() : k.toUpperCase());
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** The hero's <video>, for the stage-select map. */
const heroVideo = () => document.querySelector<HTMLVideoElement>('#player video');

/* ---- building blocks ------------------------------------------------------------------------------------------ */

/** A looping clip that only plays while it is on screen. With reduced motion it waits for a press. */
function Clip({ name, label, className }: { name: string; label: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [calm] = useState(reduced);
  const [playing, setPlaying] = useState(false);
  const { src, poster } = clip(name);

  useEffect(() => {
    const v = ref.current;
    if (!v || calm) return;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.3 });
    io.observe(v);
    return () => io.disconnect();
  }, [calm]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  return (
    <div className={`clip ${className ?? ''}`}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        aria-label={label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      {calm && (
        <button type="button" className="clip-play" onClick={toggle} aria-label={playing ? `Pause: ${label}` : `Play: ${label}`}>
          {playing ? 'PAUSE' : '▶ PLAY'}
        </button>
      )}
    </div>
  );
}

/** Section: a dithered edge in, a STAGE counter, a big extruded heading. */
function Section({
  id,
  n,
  title,
  lead,
  children,
  tone = 'case',
  prev = 'case',
}: {
  id: string;
  n: number;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  tone?: 'case' | 'panel' | 'plum';
  prev?: keyof typeof TONES | `#${string}`;
}) {
  const digits = String(n).padStart(2, '0').split('');
  const edge = ditherEdge(prev in TONES ? TONES[prev as keyof typeof TONES] : prev, TONES[tone]);
  return (
    <section id={id} className={`stage-sec tone-${tone}`} aria-labelledby={`${id}-h`} style={{ '--edge-in': edge } as CSSProperties}>
      <div className="wrap">
        <header className="sec-head">
          <div className="counter" aria-hidden="true">
            <span className="counter-tab">■ STAGE</span>
            {digits.map((d, i) => (
              <span key={i} className="tile">
                {d}
              </span>
            ))}
          </div>
          <h2 id={`${id}-h`} className="extrude">
            {title}
          </h2>
          {lead && <p className="lead">{lead}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}

const TONES = { case: '#14171b', panel: '#1b1f25', plum: '#1d1530' } as const;
/** The colour at the bottom of the hero for each background, where the first section's dithered edge starts. */
const GROUND = { night: '#14171b', dawn: '#6e5bb8', paper: '#e7e0d1' } as const;

/* ---- hero background switch ----------------------------------------------------------------------------------- */

const SKIES: { id: Sky; label: string }[] = [
  { id: 'night', label: 'Night' },
  { id: 'dawn', label: 'Dawn' },
  { id: 'paper', label: 'Paper' },
];

function SkySwitch({ sky, set }: { sky: Sky; set: (s: Sky) => void }) {
  return (
    <div className="sky-switch" role="group" aria-label="Page background behind the player">
      <span className="sky-switch-label" aria-hidden="true">
        BG
      </span>
      {SKIES.map((s) => (
        <button key={s.id} type="button" aria-pressed={sky === s.id} onClick={() => set(s.id)}>
          <span className={`sky-dot sky-dot-${s.id}`} aria-hidden="true" />
          {s.label}
        </button>
      ))}
    </div>
  );
}

/* ---- lightbox: a clip, large ---------------------------------------------------------------------------------- */

function Lightbox({ name, label, onClose }: { name: string; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { src, poster } = clip(name);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="lightbox"
      aria-label={label}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
    >
      <div className="lightbox-box">
        <button type="button" className="lightbox-close" onClick={() => ref.current?.close()} autoFocus>
          ✕ CLOSE
        </button>
        <video src={src} poster={poster} muted loop playsInline autoPlay controls={reduced()} aria-label={label} />
      </div>
    </dialog>
  );
}

/** True while the element is on screen. */
function useSeen<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

/* ---- also on: one layout at a time; the timer is one loop of its clip (two if the clip is short) ---------------- */

const SHORT_CLIP = 6; // seconds

function AlsoOn() {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const [calm] = useState(reduced);
  const [box, seen] = useSeen<HTMLDivElement>(0.3);
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const plays = useRef(0);
  const item = ALSO[i];
  const { src, poster } = clip(item.clip);
  const running = seen && !open && !calm;

  // leaving the row resets it
  useEffect(() => {
    if (!seen) setI(0);
  }, [seen]);

  useEffect(() => {
    plays.current = 0;
    if (bar.current) bar.current.style.transform = 'scaleX(0)';
    const v = video.current;
    if (v && seen) v.currentTime = 0;
  }, [i, seen]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (running) v.play().catch(() => {});
    else v.pause();
  }, [running, i]);

  const go = (n: number) => setI((n + ALSO.length) % ALSO.length);
  const loops = (v: HTMLVideoElement) => (v.duration < SHORT_CLIP ? 2 : 1);

  const onTime = () => {
    const v = video.current;
    if (!v || !bar.current || !v.duration) return;
    bar.current.style.transform = `scaleX(${Math.min(1, (plays.current + v.currentTime / v.duration) / loops(v))})`;
  };

  const onEnded = () => {
    const v = video.current;
    if (!v) return;
    plays.current += 1;
    if (plays.current < loops(v)) {
      v.currentTime = 0;
      v.play().catch(() => {});
    } else go(i + 1);
  };

  return (
    <div className="also" ref={box}>
      <div className="also-head">
        <h2 id="also-h" className="also-h">
          <span className="also-tab">ALSO ON</span> One skin, every screen
        </h2>
        <div className="also-tabs" role="group" aria-label="Layouts">
          {ALSO.map((a, n) => (
            <button key={a.clip} type="button" className="also-btn" aria-pressed={n === i} onClick={() => setI(n)}>
              {a.name}
              {n === i && <span ref={bar} className="timer" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>
      <figure className="also-stage">
        <button type="button" className="arrow" onClick={() => go(i - 1)} aria-label="Previous layout">
          ◀
        </button>
        <button type="button" className={`dev dev-${item.frame}`} onClick={() => setOpen(true)} aria-label={`${item.name}. Open this clip larger.`}>
          <video
            key={item.clip}
            ref={video}
            src={src}
            poster={poster}
            muted
            playsInline
            preload="metadata"
            onTimeUpdate={onTime}
            onEnded={onEnded}
          />
          <span className="zoom" aria-hidden="true">
            EXPAND
          </span>
        </button>
        <button type="button" className="arrow" onClick={() => go(i + 1)} aria-label="Next layout">
          ▶
        </button>
        <figcaption aria-live="polite">
          <b>{item.name}</b>
          {item.text}
        </figcaption>
      </figure>
      {open && <Lightbox name={item.clip} label={`${item.name}. ${item.text}`} onClose={() => setOpen(false)} />}
    </div>
  );
}

/* ---- the move list: each clip plays twice, then the next move; leaving the section resets it ------------------- */

const PLAYS = 2;

function MoveList() {
  const [i, setI] = useState(0);
  const [calm] = useState(reduced);
  const [box, seen] = useSeen<HTMLDivElement>(0.25);
  const screen = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const plays = useRef(0);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const m = MOVES[i];
  const { src, poster } = clip(m.clip);

  // leaving the section resets the list to the first move
  useEffect(() => {
    if (!seen) setI(0);
  }, [seen]);

  useEffect(() => {
    plays.current = 0;
    if (bar.current) bar.current.style.width = '0%';
    const v = screen.current;
    if (!v) return;
    if (seen && !calm) {
      v.currentTime = 0;
      v.play().catch(() => {});
    } else v.pause();
  }, [seen, i, calm]);

  const onTime = () => {
    const v = screen.current;
    if (!v || !bar.current || !v.duration) return;
    bar.current.style.width = `${Math.min(100, ((plays.current + v.currentTime / v.duration) / PLAYS) * 100)}%`;
  };

  const onEnded = () => {
    const v = screen.current;
    if (!v) return;
    plays.current += 1;
    if (plays.current < PLAYS || calm) {
      if (calm) plays.current = 0;
      v.currentTime = 0;
      if (!calm) v.play().catch(() => {});
    } else setI((n) => (n + 1) % MOVES.length);
  };

  const pick = (n: number, focus = false) => {
    setI(n);
    if (focus) items.current[n]?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (e.key === 'Home') pick(0, true);
    else if (e.key === 'End') pick(MOVES.length - 1, true);
    else if (step) pick((i + step + MOVES.length) % MOVES.length, true);
    else return;
    e.preventDefault();
  };

  return (
    <div className="movelist" ref={box}>
      <div className="ml-menu">
        <ul aria-label="Moves" onKeyDown={onKey}>
          {MOVES.map((mv, n) => (
            <li key={mv.name}>
              <button
                ref={(el) => {
                  items.current[n] = el;
                }}
                type="button"
                className="ml-item"
                aria-pressed={n === i}
                aria-controls="ml-screen"
                tabIndex={n === i ? 0 : -1}
                onClick={() => pick(n)}
              >
                <span className="ml-cursor" aria-hidden="true">
                  ▶
                </span>
                <span className="ml-num" aria-hidden="true">
                  {String(n + 1).padStart(2, '0')}
                </span>
                {mv.name}
              </button>
            </li>
          ))}
        </ul>
        <p className="ml-hint">Click a move, or ↑ ↓</p>
      </div>

      <div className="ml-screen frame" id="ml-screen">
        <div className="ml-hud">
          <span className="ml-hud-tab">
            MOVE {String(i + 1).padStart(2, '0')}/{MOVES.length}
          </span>
          <span className="ml-hud-name">{m.name}</span>
          <span className="ml-hud-reads">
            READS <b>{m.reads}</b>
          </span>
        </div>
        <div className="ml-bar" aria-hidden="true">
          <span ref={bar} />
        </div>
        <div className="ml-glass">
          <video
            key={m.clip}
            ref={screen}
            src={src}
            poster={poster}
            muted
            playsInline
            controls={calm}
            preload="auto"
            aria-label={`${m.name}: ${m.text}`}
            onTimeUpdate={onTime}
            onEnded={onEnded}
          />
        </div>
        <p className="ml-text">{m.text}</p>
      </div>
    </div>
  );
}

/* ---- stage select: the showreel's chapters as a map; pick one and the player above warps there ---------------- */

// node positions on a 100 x 40 grid, a winding path left to right
const NODES = [
  [6, 30],
  [18, 12],
  [31, 26],
  [44, 9],
  [56, 28],
  [68, 12],
  [81, 27],
  [93, 10],
];

function StageSelect() {
  const [now, setNow] = useState(-1);

  // follow the hero player: the node it is in lights up
  useEffect(() => {
    let v: HTMLVideoElement | null = null;
    let tries = 0;
    const update = () => {
      if (!v) return;
      let k = -1;
      CHAPTERS.forEach((c, n) => v!.currentTime >= c.t && (k = n));
      setNow(v.currentTime > 0 || !v.paused ? k : -1);
    };
    const hook = window.setInterval(() => {
      v = heroVideo();
      if (v || ++tries > 40) {
        window.clearInterval(hook);
        v?.addEventListener('timeupdate', update);
        v?.addEventListener('seeked', update);
      }
    }, 250);
    return () => {
      window.clearInterval(hook);
      v?.removeEventListener('timeupdate', update);
      v?.removeEventListener('seeked', update);
    };
  }, []);

  const warp = (t: number) => {
    const v = heroVideo();
    if (!v) return;
    v.currentTime = t + 0.05;
    v.play().catch(() => {});
    document.getElementById('player')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
  };

  // a stepped path: horizontal, then vertical, between nodes
  let d = `M${NODES[0][0]} ${NODES[0][1]}`;
  for (let k = 1; k < NODES.length; k++) {
    const [x0] = NODES[k - 1];
    const [x1, y1] = NODES[k];
    const mid = Math.round((x0 + x1) / 2);
    d += ` H${mid} V${y1} H${x1}`;
  }

  return (
    <div className="map">
      <svg className="map-path" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        <path d={d} />
      </svg>
      <ol className="map-nodes">
        {CHAPTERS.map((c, n) => (
          <li key={c.name} style={{ left: `${NODES[n][0]}%`, top: `${(NODES[n][1] / 40) * 100}%` }}>
            <button
              type="button"
              className={`node${n === now ? ' here' : ''}${n < now ? ' done' : ''}`}
              onClick={() => warp(c.t)}
              aria-label={`Stage ${n + 1}, ${c.name}, at ${clock(c.t)}. Play from here in the player above.`}
            >
              <span className="node-n" aria-hidden="true">
                {n + 1}
              </span>
              <span className="node-name">{c.name}</span>
              <span className="node-t">{clock(c.t)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---- controls diagram: numbers outside the picture, a line to each part ---------------------------------------- */

function Diagram() {
  const [on, setOn] = useState(-1);
  return (
    <figure className="diagram">
      <div className="diagram-pic">
        <img src={img('state-play')} alt="The HISS player while playing, with its eight parts numbered." width={1440} height={1302} loading="lazy" />
        {PARTS.map((p, n) => (
          <span
            key={p.name}
            className={`call call-${p.side}${on === n ? ' on' : ''}`}
            style={{ '--x': `${p.x}%`, '--y': `${p.y}%` } as CSSProperties}
            onMouseEnter={() => setOn(n)}
            onMouseLeave={() => setOn(-1)}
            aria-hidden="true"
          >
            <i className="call-line" />
            <i className="call-dot" />
            <b className="call-n">{n + 1}</b>
          </span>
        ))}
      </div>
      <figcaption>
        <ol className="legend">
          {PARTS.map((p, n) => (
            <li key={p.name} className={on === n ? 'on' : undefined} onMouseEnter={() => setOn(n)} onMouseLeave={() => setOn(-1)}>
              <b>{p.name}</b>
              <span>{p.job}</span>
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}

/* ---- keyboard: press a key anywhere outside the player and its row lights up ---------------------------------- */

function Keys() {
  const [lit, setLit] = useState<{ row: number; key: string } | null>(null);
  const timer = useRef(0);

  const onKey = useCallback((e: globalThis.KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest('.media-skin, input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    const row = KEYS.findIndex((k) => k.match.includes(e.key) || k.match.includes(e.key.toLowerCase()));
    if (row < 0) return;
    setLit({ row, key: keyName(e.key) });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLit(null), 1600);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  return (
    <div className="keys-panel">
      <div className="lcd" aria-live="polite">
        {lit ? (
          <>
            <span className="lcd-key">{lit.key}</span>
            <span className="lcd-arrow" aria-hidden="true">
              ▶
            </span>
            <span>{KEYS[lit.row].what.toUpperCase()}</span>
          </>
        ) : (
          <span className="lcd-idle blink">PRESS A KEY</span>
        )}
      </div>
      <table className="keys">
        <tbody>
          {KEYS.map((k, n) => (
            <tr key={k.keys} className={lit?.row === n ? 'lit' : undefined}>
              <th scope="row">
                <kbd>{k.keys}</kbd>
              </th>
              <td>{k.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- dock: fixed keys at the bottom of the page ---------------------------------------------------------------- */

function Dock() {
  const [far, setFar] = useState(false);
  useEffect(() => {
    const on = () => setFar(window.scrollY > 700);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <nav className="dock" aria-label="Quick links">
      {far && (
        <a className="dock-key" href="#top">
          ▲ Top
        </a>
      )}
      <a className="dock-key" href="#contact">
        Contact
      </a>
      <a className="dock-key dock-gold" href={SITE}>
        ganeshdg.com ↗
      </a>
    </nav>
  );
}

/* ---- page ----------------------------------------------------------------------------------------------------- */

/**
 * On phones the top bar slides away while you scroll down the page and comes back as soon as you scroll up (or reach
 * the top), so it doesn't eat the small screen. On wider screens it always stays.
 */
function useHideOnScroll() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const phone = window.matchMedia('(max-width: 960px)');
    let last = window.scrollY;
    const on = () => {
      const y = window.scrollY;
      if (!phone.matches || y < 80) setHidden(false);
      else if (Math.abs(y - last) > 6) setHidden(y > last);
      last = y;
    };
    window.addEventListener('scroll', on, { passive: true });
    phone.addEventListener('change', on);
    return () => {
      window.removeEventListener('scroll', on);
      phone.removeEventListener('change', on);
    };
  }, []);
  return hidden;
}

export function Page() {
  const [sky, setSky] = useState<Sky>('night');
  const barHidden = useHideOnScroll();

  const startPlayer = () => {
    const start = document.querySelector<HTMLElement>('#player .coil-start');
    document.getElementById('player')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
    window.setTimeout(() => start?.focus({ preventScroll: true }), 450);
  };

  return (
    <>
      <a className="skip" href="#player">
        Skip to the player
      </a>
      <header className={`topbar${barHidden ? ' topbar-away' : ''}`} onFocus={() => document.querySelector('.topbar-away')?.classList.remove('topbar-away')}>
        <div className="topbar-row">
          <a className="mark" href="#top" aria-label="HISS, back to the top">
            <span className="mark-tab">HISS</span>
            <span className="mark-sub">Video.js 10 skin</span>
          </a>
          <nav aria-label="Sections">
            <ul>
              {STAGES.map(([id, label], n) => (
                <li key={id}>
                  <a href={`#${id}`}>
                    <span className="nav-n" aria-hidden="true">
                      {n + 1}
                    </span>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <ScrollSnake stages={STAGE_IDS} />
      </header>

      <main id="top">
        {/* ---- title screen ---- */}
        <section className={`hero sky-${sky}`} aria-labelledby="title-h">
          <PixelSky sky={sky} />
          <div className="wrap hero-inner">
            <div className="hero-title">
              <div className="hero-idle" aria-hidden="true">
                <CoilIdleSnake />
              </div>
              <div>
                <p className="kicker">
                  <span className="blink" aria-hidden="true">
                    ▶
                  </span>{' '}
                  A game-console skin for Video.js 10
                </p>
                <h1 id="title-h" className="logo">
                  HISS
                </h1>
              </div>
            </div>
            <p className="pitch">
              The seek bar is a lane and the playhead is a snake. Every pellet it eats is time you have watched, and every
              screen it shows is a real player state.
            </p>

            <div className="hero-bar">
              <button type="button" className="press-start" onClick={startPlayer}>
                <span className="blink" aria-hidden="true">
                  ▶
                </span>{' '}
                PRESS START
              </button>
              <a className="get-posters" href="./hiss/hiss-posters.zip" download="HISS posters.zip">
                <span aria-hidden="true">▼</span> DOWNLOAD POSTERS
                <small>ZIP · 2 MB</small>
              </a>
              <p className="try">Try it: drag the snake, put the mouse away, resize the window.</p>
              <SkySwitch sky={sky} set={setSky} />
            </div>

            <div className="player-wrap" id="player">
              <VideoPlayer poster={POSTER} title="Showreel 2026">
                <VideoSkin>
                  <MuxVideo src={SRC} playsInline crossOrigin="" preload="metadata">
                    <track kind="chapters" label="English" srcLang="en" src="./showreel-chapters.vtt" default />
                    <track kind="captions" label="About the work" srcLang="en" src="./showreel-about.vtt" />
                  </MuxVideo>
                </VideoSkin>
              </VideoPlayer>
            </div>
            <p className="playing">
              Now playing: Showreel 2026 by <a href={SITE}>Ganesh Datta G</a>, streamed from Mux. Eight chapters are eight
              stages; CC turns on notes about each piece.
            </p>

            <AlsoOn />
          </div>
        </section>

        <Section
          id="play"
          n={1}
          tone="panel"
          prev={GROUND[sky]}
          title="How to play"
          lead="Every move is a normal player action, and every screen is a real player state. Each clip plays twice, then the next move starts."
        >
          <MoveList />
        </Section>

        <Section
          id="stages"
          n={2}
          tone="plum"
          prev="panel"
          title="Stages"
          lead="Chapters come from a standard WebVTT file, so any video with chapters gets stages for free. The showreel has eight."
        >
          <figure className="stages-clip">
            <Clip name="stages" label="Crossing a flag changes the STAGE name; STAGE hides and shows the flags; a click on a flag jumps there." className="frame" />
            <figcaption>
              Crossing a flag changes the STAGE name in the HUD. The STAGE key hides or shows the flags. Click a flag and the
              snake jumps there.
            </figcaption>
          </figure>
          <h3 className="mini map-h">Stage select</h3>
          <p className="map-lead">Pick a stage and the player at the top jumps there and plays.</p>
          <StageSelect />
        </Section>

        <Section id="console" n={3} tone="case" prev="plum" title="The console" lead="Every key does what a player key does and sits where you would look for it.">
          <Diagram />
        </Section>

        <Section id="system" n={4} tone="panel" prev="case" title="System" lead="Why it looks the way it does, and what it is built from.">
          <div className="why">
            <article className="why-lead">
              <h3 className="mini">Why a game console</h3>
              <p>
                Watching a video already works like a game: there is a score (how far you are), a goal (how long it is) and
                stages (chapters). HISS draws that game on top of a normal Video.js player. The stock slider still takes every
                click, drag and key press, and screen readers hear the stock player. The snake only draws what the player
                reports, so nothing on screen is decoration.
              </p>
              <p>
                It is the player on my own portfolio, so it also had to sit on someone else’s page. The console is one solid,
                self-contained object. Switch the background at the top of this page to Dawn or Paper to see it on a bright
                site.
              </p>
              <p>
                Nothing glows or blurs. A lit key is a brighter key, and depth is a 2 px bevel. Gold means live or pressable,
                red means muted or broken. The pixel face, Jersey 15, is set only at 15, 30, 45 and 60 px so it lands on whole
                screen pixels.
              </p>
            </article>
            <div className="rules">
              <h3 className="mini">The rules</h3>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Player</th>
                    <th scope="col">Game</th>
                    <th scope="col">What you see</th>
                  </tr>
                </thead>
                <tbody>
                  {RULES.map(([a, b, c]) => (
                    <tr key={a}>
                      <th scope="row">{a}</th>
                      <td>{b}</td>
                      <td>{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <h3 className="mini sys-h">Eight colours</h3>
          <ul className="swatches">
            {PALETTE.map((c) => (
              <li key={c.hex}>
                <span className="chip" style={{ background: c.hex }} aria-hidden="true" />
                <b>{c.name}</b>
                <code>{c.hex}</code>
                <span>{c.role}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="access" n={5} tone="case" prev="panel" title="Access" lead="The game sits on top of a player that works for everyone.">
          <div className="access">
            <figure className="access-clip">
              <Clip name="keyboard" label="Keyboard only: Tab into the player, then Space, arrows, C and M, with each key shown on screen." className="frame" />
              <figcaption>No mouse: Tab in, then Space, arrows, C and M. The key caps show what was pressed.</figcaption>
            </figure>
            <Keys />
          </div>
          <ul className="checks">
            <li>
              <b>Focus</b> Tab reaches every control in order, each with a gold ring.
            </li>
            <li>
              <b>Targets</b> Every key is at least 44 by 44 px.
            </li>
            <li>
              <b>Contrast</b> Text sits on the solid console: 14.7:1, gold 10.0:1.
            </li>
            <li>
              <b>Screen readers</b> They hear the stock player; the snake is hidden.
            </li>
            <li>
              <b>High contrast</b> The snake steps aside for a plain track and thumb.
            </li>
            <li>
              <b>Reduced motion</b> No wave, lunge or blink. Progress still shows.
            </li>
          </ul>
        </Section>
      </main>

      {/* ---- contact: the end screen ---- */}
      <footer className="end" id="contact" style={{ '--edge-in': ditherEdge(TONES.case, '#0b0a1e') } as CSSProperties}>
        <div className="wrap end-inner">
          <p className="end-kicker">
            <span className="blink">●</span> PLAYER 2 PRESS START
          </p>
          <h2 className="end-banner extrude">CONTINUE?</h2>
          <p className="end-lead">
            I’m Ganesh Datta G, a creative technologist and motion designer who builds things like this. If you want to work together, the links are below.
          </p>
          <ul className="end-links">
            {LINKS.map(([label, href], n) => (
              <li key={label}>
                <a className="key-link" href={href}>
                  <span className="key-n" aria-hidden="true">
                    {n + 1}
                  </span>
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <dl className="credits">
            <div>
              <dt>Player</dt>
              <dd>
                <a href="https://videojs.org">Video.js 10</a>, from the Scaffold skin
              </dd>
            </div>
            <div>
              <dt>Video</dt>
              <dd>
                Showreel 2026 on <a href="https://www.mux.com">Mux</a>
                <br />
                <code>{PLAYBACK_ID}</code>
              </dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>Jersey 15, Atkinson Hyperlegible Next</dd>
            </div>
            <div>
              <dt>Licence</dt>
              <dd>Apache 2.0</dd>
            </div>
          </dl>
        </div>
      </footer>
      <Dock />
    </>
  );
}
