import { MuxVideo } from '@videojs/react/media/mux-video';
import { VideoPlayer } from '@videojs/react/video';
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { CoilIdleSnake } from '@/video/coil/coil-idle';
import { CoilLoader } from '@/video/coil/coil-loader';
import { VideoSkin } from '@/video/skin';

import { ScrollSnake } from './scroll-snake';

// The film on this page: Ganesh's 2026 showreel, hosted on Mux (public playback ID).
export const PLAYBACK_ID = 'cIfeUUvOtvTx4u1vBjo1lPse00cqzO7TDxrDEX9DFUgE';
const SRC = `https://stream.mux.com/${PLAYBACK_ID}.m3u8`;
const POSTER = `https://image.mux.com/${PLAYBACK_ID}/thumbnail.webp?time=7.5&width=1920`;
const img = (name: string) => `./hiss/${name}.webp`;
const clip = (name: string) => ({ src: `./hiss/clips/${name}.mp4`, poster: `./hiss/clips/${name}.webp` });

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Sections double as the stages on the top-bar lane. */
export const STAGES = [
  ['moves', 'Moves'],
  ['screens', 'Screens'],
  ['controls', 'Controls'],
  ['sizes', 'Sizes'],
  ['notes', 'Notes'],
  ['system', 'System'],
  ['access', 'Access'],
  ['credits', 'Credits'],
] as const;
const STAGE_IDS = STAGES.map(([id]) => id);

/** The move list. Every clip is the real skin, recorded from the workbench. */
const MOVES = [
  { clip: 'start', name: 'START', reads: 'first play', text: 'The title-screen snake idles over the poster. Press START and it lunges onto the lane with its mouth open.' },
  { clip: 'eat', name: 'EAT', reads: 'current time', text: 'The head bites each pellet as it reaches it. Every bite pops a +1 chip and SCORE ticks over.' },
  { clip: 'boost', name: 'BOOST', reads: 'seek forward', text: 'Seek ahead and the snake dashes there, swallowing every pellet it passes. The chip shows the seconds gained.' },
  { clip: 'cough', name: 'COUGH', reads: 'seek back', text: 'Seek back and it coughs the pellets onto the lane again and recoils. The chip shows the seconds lost, in red.' },
  { clip: 'knot', name: 'KNOT', reads: 'paused', text: 'Pause and the snake ties itself in an overhand knot. Left alone, it strains, shakes and gives up.' },
  { clip: 'volume', name: 'VOLUME', reads: 'volume, muted', text: 'Louder sound makes a bigger, faster wave down the body. B mutes, the key turns red and the body goes nearly still.' },
  { clip: 'hover', name: 'SCOUT', reads: 'pointer on the lane', text: 'Point at the lane and it magnifies under the cursor, with the time and chapter name at that spot.' },
  { clip: 'loading', name: 'LOADING', reads: 'waiting, buffered', text: 'On a slow connection a snake chases its own tail on the screen. Pellets light up as the video loads.' },
  { clip: 'stages', name: 'STAGES', reads: 'chapters', text: 'Flags stand at each chapter. Crossing one pops STAGE n. The STAGE key in the HUD hides or shows the flags.' },
  { clip: 'menu', name: 'MENU', reads: 'settings', text: 'The settings menu opens from its key like an in-game menu, with an arrow cursor that follows the arrow keys.' },
];

const SCREENS = [
  { clip: 'start', name: 'PRESS START', when: 'Before the first play', text: 'A coiled snake idles over the poster frame. START, A, Space or a tap on the picture begins.' },
  { clip: 'paused', name: 'PAUSED', when: 'Whenever playback stops', text: 'The frame dims under a pause panel with SCORE and GOAL, like a game pause menu.' },
  { clip: 'clear', name: 'STAGE CLEAR', when: 'When the video ends', text: 'Every pellet is gone. The panel shows the time and stages cleared, and A becomes PLAY AGAIN.' },
  { clip: 'gameover', name: 'GAME OVER', when: 'When the video fails', text: 'The console dims and CONTINUE? retries. Screen readers get the full error message.' },
];

/** Parts of the console, numbered on the diagram. x and y are percentages of the picture. */
const PARTS = [
  { x: 4, y: 9, name: 'SCORE', job: 'Current time. A +1 chip pops each time the snake eats.' },
  { x: 47, y: 9, name: 'STAGE', job: 'The current chapter. Press it to show or hide the chapter flags.' },
  { x: 96, y: 9, name: 'GOAL', job: 'Length of the video.' },
  { x: 50, y: 42, name: 'SCREEN', job: 'The video. Click or tap it to play and pause.' },
  { x: 29, y: 74, name: 'LANE', job: 'The seek bar. The snake head is the playhead; click, drag or use the arrow keys.' },
  { x: 3, y: 79, name: 'A / B', job: 'A plays and pauses. B mutes.' },
  { x: 40, y: 80, name: 'OPTIONS', job: 'Captions, settings menu, picture in picture, fullscreen.' },
  { x: 97, y: 79, name: 'D-PAD', job: 'Left and right jump 10 seconds. Up and down set the volume.' },
];

const PALETTE = [
  { hex: '#14171b', name: 'Case', role: 'Console body and this page.' },
  { hex: '#1d2127', name: 'Panel', role: 'Keys and HUD wells.' },
  { hex: '#2c323a', name: 'Edge', role: 'Bevels and borders. Decorative, 1.4:1.' },
  { hex: '#ece8df', name: 'Bone', role: 'Text and icons. 14.7:1 on Case.' },
  { hex: '#a7a399', name: 'Dim', role: 'Key legends. 7.1:1 on Case.' },
  { hex: '#ffb21e', name: 'Gold', role: 'Live or pressable: A, pellets, SCORE, focus. 10.0:1.' },
  { hex: '#ff4d3d', name: 'Red', role: 'Muted and GAME OVER only. 5.5:1 on Case.' },
  { hex: '#0a0b0d', name: 'Ink', role: 'Text on gold. 10.9:1.' },
];

/** Keyboard map. `match` lists the KeyboardEvent.key values that light the row. */
const KEYS: { keys: string; what: string; match: string[] }[] = [
  { keys: 'Space · K · A', what: 'Play or pause', match: [' ', 'k', 'a'] },
  { keys: 'M · B', what: 'Mute or unmute', match: ['m', 'b'] },
  { keys: '← → · J L', what: 'Seek back or forward', match: ['ArrowLeft', 'ArrowRight', 'j', 'l'] },
  { keys: '↑ ↓', what: 'Volume', match: ['ArrowUp', 'ArrowDown'] },
  { keys: '0 to 9', what: 'Jump to 0% to 90%', match: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] },
  { keys: 'Home · End', what: 'Start or end', match: ['Home', 'End'] },
  { keys: 'F', what: 'Fullscreen', match: ['f'] },
  { keys: 'C', what: 'Captions', match: ['c'] },
  { keys: 'I', what: 'Picture in picture', match: ['i'] },
  { keys: '< >', what: 'Slower or faster', match: ['<', '>'] },
];

const keyName = (k: string) => (k === ' ' ? 'SPACE' : k.startsWith('Arrow') ? k.slice(5).toUpperCase() : k.toUpperCase());

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
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.35 });
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

/** Section header styled like the HUD counter: a gold tab, then the stage number on digit tiles. */
function Section({ id, n, title, lead, children, band }: { id: string; n: number; title: string; lead?: ReactNode; children: ReactNode; band?: boolean }) {
  const digits = String(n).padStart(2, '0').split('');
  return (
    <section id={id} className={`stage-sec${band ? ' band' : ''}`} aria-labelledby={`${id}-h`}>
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
          <h2 id={`${id}-h`}>{title}</h2>
          {lead && <p className="lead">{lead}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}

/* ---- the move list: demo mode until you pick a move ----------------------------------------------------------- */

function MoveList() {
  const [i, setI] = useState(0);
  const [attract, setAttract] = useState(() => !reduced());
  const [seen, setSeen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLVideoElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const m = MOVES[i];
  const { src, poster } = clip(m.clip);

  // only run while the section is on screen
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const v = screen.current;
    if (!v) return;
    if (seen && (attract || !reduced())) v.play().catch(() => {});
    else v.pause();
  }, [seen, i, attract]);

  const pick = (n: number, focus = false) => {
    setAttract(false);
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
        <div className="ml-mode" aria-live="polite">
          {attract ? (
            <>
              <span className="blink">DEMO</span> PICK A MOVE TO TAKE OVER
            </>
          ) : (
            <>
              PRACTICE ·{' '}
              <button type="button" className="ml-demo" onClick={() => setAttract(true)}>
                RESUME DEMO
              </button>
            </>
          )}
        </div>
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
        <p className="ml-hint">↑ ↓ to choose</p>
      </div>

      <div className="ml-screen" id="ml-screen">
        <div className="ml-hud">
          <span className="ml-hud-tab">
            MOVE {String(i + 1).padStart(2, '0')}/{MOVES.length}
          </span>
          <span className="ml-hud-name">{m.name}</span>
          <span className="ml-hud-reads">
            READS <b>{m.reads}</b>
          </span>
        </div>
        <div className="ml-glass">
          <video
            key={m.clip}
            ref={screen}
            src={src}
            poster={poster}
            muted
            playsInline
            loop={!attract}
            preload="auto"
            aria-label={`${m.name}: ${m.text}`}
            onEnded={() => attract && setI((n) => (n + 1) % MOVES.length)}
          />
        </div>
        <p className="ml-text">{m.text}</p>
      </div>
    </div>
  );
}

/* ---- controls diagram: hover a part or a pin to light both ---------------------------------------------------- */

function Diagram() {
  const [on, setOn] = useState(-1);
  return (
    <figure className="diagram">
      <div className="diagram-pic">
        <img src={img('state-play')} alt="The HISS player while playing, with its eight parts numbered." width={896} height={762} />
        {PARTS.map((p, n) => (
          <span
            key={p.name}
            className={`pin${on === n ? ' on' : ''}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            onMouseEnter={() => setOn(n)}
            onMouseLeave={() => setOn(-1)}
            aria-hidden="true"
          >
            {n + 1}
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
          <span className="lcd-idle">PRESS A KEY</span>
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
      <p className="small">Focus the player and these keys drive it. They never fire while you type in a field.</p>
    </div>
  );
}

/* ---- page ----------------------------------------------------------------------------------------------------- */

export function Page() {
  const startPlayer = () => {
    const start = document.querySelector<HTMLElement>('#play .coil-start');
    document.getElementById('play')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
    window.setTimeout(() => start?.focus({ preventScroll: true }), 450);
  };

  return (
    <>
      <a className="skip" href="#play">
        Skip to the player
      </a>
      <header className="topbar">
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
        <section className="title" aria-labelledby="title-h">
          <div className="wrap title-grid">
            <div className="title-copy">
              <div className="idle" aria-hidden="true">
                <CoilIdleSnake />
              </div>
              <h1 id="title-h">HISS</h1>
              <p className="kicker">A game-console skin for Video.js 10</p>
              <p className="pitch">
                The playhead is a snake. It eats the pellets laid along the timeline, so its length is how much you have
                watched. Every button is a normal player button.
              </p>
              <button type="button" className="press-start" onClick={startPlayer}>
                <span className="blink">▶</span> PRESS START
              </button>
              <dl className="stats">
                <div>
                  <dt>Moves</dt>
                  <dd>{MOVES.length}</dd>
                </div>
                <div>
                  <dt>Screens</dt>
                  <dd>{SCREENS.length}</dd>
                </div>
                <div>
                  <dt>Colours</dt>
                  <dd>{PALETTE.length}</dd>
                </div>
                <div>
                  <dt>Min key</dt>
                  <dd>44px</dd>
                </div>
              </dl>
            </div>
            <div className="title-player" id="play">
              <VideoPlayer poster={POSTER} title="Showreel 2026">
                <VideoSkin>
                  <MuxVideo src={SRC} playsInline crossOrigin="" preload="metadata">
                    <track kind="chapters" label="English" srcLang="en" src="./showreel-chapters.vtt" default />
                    <track kind="captions" label="About the work" srcLang="en" src="./showreel-about.vtt" />
                  </MuxVideo>
                </VideoSkin>
              </VideoPlayer>
              <p className="playing">
                Now playing: Showreel 2026 by <a href="https://ganeshdg.com">Ganesh Datta G</a>, streamed from Mux. Play it,
                seek it, pause it. The eight chapters are stages on the lane, and CC turns on notes about each piece.
              </p>
            </div>
          </div>
        </section>

        <Section id="moves" n={1} band title="Move list" lead="Everything the snake does comes from the player's real state. Pick a move to see it.">
          <MoveList />
        </Section>

        <Section id="screens" n={2} title="Screens" lead="Each player state gets its own screen, named the way a game would name it.">
          <div className="screens">
            {SCREENS.map((s) => (
              <figure key={s.name}>
                <Clip name={s.clip} label={`${s.name} screen. ${s.text}`} />
                <figcaption>
                  <b>{s.name}</b>
                  <span className="when">{s.when}</span>
                  <span>{s.text}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>

        <Section id="controls" n={3} title="Controls" lead="Each button does what a player button does and sits where you would look for it.">
          <Diagram />
          <div className="parts">
            <figure>
              <img src={img('part-ab')} alt="The A key, a gold octagon showing pause, and the B key, a red octagon showing muted." width={210} height={115} />
              <figcaption>
                <b>A and B.</b> Octagon face buttons. A is the only gold key because you press it most. B turns red while the sound is off.
              </figcaption>
            </figure>
            <figure>
              <img src={img('part-options')} alt="Four square keys labelled CC, MENU, PIP and FULL." width={290} height={85} />
              <figcaption>
                <b>Option keys.</b> Pixel icons with the name printed underneath, so nobody has to guess a glyph.
              </figcaption>
            </figure>
            <figure>
              <img src={img('part-dpad')} alt="A D-pad with VOL+ on top, VOL- below, -10 on the left and +10 on the right." width={155} height={145} />
              <figcaption>
                <b>D-pad.</b> Laid out like the arrow keys: left and right move through time, up and down change the volume.
              </figcaption>
            </figure>
            <figure>
              <img src={img('part-score')} alt="The SCORE counter reading 0:44 in separate digit tiles." width={175} height={60} />
              <figcaption>
                <b>Counters.</b> One tile per digit. The bar under SCORE fills as the video plays.
              </figcaption>
            </figure>
          </div>
        </Section>

        <Section id="sizes" n={4} band title="Every size" lead="One skin from a phone held upright to fullscreen on a monitor.">
          <div className="sizes">
            <figure className="land">
              <Clip name="landscape" label="HISS on a phone held sideways, playing and seeking." />
              <figcaption>
                <b>Phone, sideways.</b> It turns into a handheld: the picture at full height, A and B under the left thumb, the D-pad under the right, the lane along the bottom. Fullscreen uses the same layout.
              </figcaption>
            </figure>
            <figure className="port">
              <img src={img('phone-portrait')} alt="HISS on a phone held upright: HUD, picture, lane, then the pad in two rows." width={390} height={594} loading="lazy" />
              <figcaption>
                <b>Phone, upright.</b> The lane drops to 60 px and the snake draws at 70% so more pellets fit.
              </figcaption>
            </figure>
          </div>
        </Section>

        <Section id="notes" n={5} title="Notes" lead="Why it looks and behaves the way it does.">
          <div className="notes">
            <article>
              <h3>A snake grows as it eats</h3>
              <p>
                A progress bar grows as you watch, and so does a snake. The body behind the head is the time you have
                watched and the pellets ahead are the time left, so the lane still works as an ordinary seek bar.
              </p>
            </article>
            <article>
              <h3>The head is always on the true time</h3>
              <p>
                The lane starts with a short run-up, so at 0:00 the head already sits on the start line. The canvas draws
                over the stock Video.js time slider and never takes input. Clicks, drags, arrow keys and what a screen reader
                hears all come from Video.js.
              </p>
            </article>
            <article>
              <h3>The picture stays clear while it plays</h3>
              <p>
                The HUD sits above the screen and the lane and pad below it, so nothing covers the video during playback.
                The PAUSED panel covers the frame on purpose, because a game's pause menu does.
              </p>
            </article>
            <article>
              <h3>Flat light, hard edges</h3>
              <p>
                Nothing glows or blurs. A lit key is a brighter key, and depth comes from a 2 px bevel and a key that moves
                down when pressed. Gold means live or pressable, red means muted or broken.
              </p>
            </article>
            <article>
              <h3>Type on the pixel grid</h3>
              <p>
                Jersey 15 is drawn on a 15 px grid, so every label is set at 15, 30, 45 or 60 px. At those sizes the pixels
                land on whole screen pixels and stay sharp.
              </p>
            </article>
            <article>
              <h3>Calm when asked</h3>
              <p>
                With reduced motion on, the snake jumps straight to the time with no wave, lunge or burst, and blinking text
                holds still. The video still plays, and this page waits for a press before it plays any clip.
              </p>
            </article>
          </div>
        </Section>

        <Section id="system" n={6} band title="System" lead="Eight colours, one pixel face for the console, and sprites drawn live on canvas.">
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

          <div className="system-row">
            <div className="type">
              <p className="t60">STAGE CLEAR</p>
              <p className="t30">SCORE 0:45 · GOAL 1:51</p>
              <p className="t15">A · PLAY   B · MUTE   CC   MENU   PIP   FULL</p>
              <p className="type-note">Jersey 15 at 60, 30 and 15 px for banners, counters and labels.</p>
            </div>
            <div className="sprites">
              <figure>
                <div className="sprite-box">
                  <CoilIdleSnake />
                </div>
                <figcaption>
                  <b>Title snake.</b> Drawn live by the skin's own code, the same one that sits over PRESS START.
                </figcaption>
              </figure>
              <figure>
                <div className="sprite-box loader-box">
                  <CoilLoader />
                </div>
                <figcaption>
                  <b>Loader.</b> Chases its own tail on a new path every time it appears.
                </figcaption>
              </figure>
            </div>
          </div>

          <h3 className="sub">Theme it</h3>
          <p className="body">
            HISS keeps the Video.js accent variable for the gold. The rest of the palette lives in <code>--coil-*</code> variables on the skin.
          </p>
          <pre className="code">
            <code>{`.media-skin.coil {
  --media-accent-color: #ffb21e;  /* A key, pellets, SCORE, focus */
  --coil-case: #14171b;           /* console body */
  --coil-bone: #ece8df;           /* text and icons */
  --coil-red: #ff4d3d;            /* muted, GAME OVER */
  --coil-key: 46px;               /* key size, 44px on phones */
}`}</code>
          </pre>
        </Section>

        <Section id="access" n={7} title="Access" lead="The game sits on top of a normal, accessible Video.js player.">
          <div className="access">
            <Keys />
            <ul className="checks">
              <li>
                <b>Focus.</b> Tab reaches every control in the order you see it, and each one shows a gold outline.
              </li>
              <li>
                <b>Targets.</b> Every key is at least 44 by 44 px, on phones too.
              </li>
              <li>
                <b>Contrast.</b> All text passes WCAG AA on the console: bone 14.7:1, gold 10.0:1, red 5.5:1.
              </li>
              <li>
                <b>Screen readers.</b> The snake canvas is hidden from them. The seek bar reads the time, STAGE reads the chapter, GAME OVER reads the full error.
              </li>
              <li>
                <b>High contrast.</b> With forced colours or more contrast requested, the snake goes and a plain bordered track and thumb come back.
              </li>
              <li>
                <b>Reduced motion.</b> No wave, lunge, burst or blink. Seeking and progress still show.
              </li>
            </ul>
          </div>
        </Section>

        <Section id="credits" n={8} title="Credits">
          <dl className="credits">
            <div>
              <dt>Design and build</dt>
              <dd>
                <a href="https://ganeshdg.com">Ganesh Datta G</a>
              </dd>
            </div>
            <div>
              <dt>Player</dt>
              <dd>
                <a href="https://videojs.org">Video.js 10</a>, from the Scaffold skin
              </dd>
            </div>
            <div>
              <dt>Video</dt>
              <dd>
                Hosted on <a href="https://www.mux.com">Mux</a>, playback ID <code>{PLAYBACK_ID}</code>
              </dd>
            </div>
            <div>
              <dt>Clips</dt>
              <dd>Recorded from the skin playing Cosmic Dawn, the Video.js sample film</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>Jersey 15 by Sarah Cadigan-Fried, Atkinson Hyperlegible Next by the Braille Institute</dd>
            </div>
            <div>
              <dt>Licence</dt>
              <dd>Apache 2.0</dd>
            </div>
          </dl>
        </Section>
      </main>

      <footer className="foot">
        <span>HISS · made for the Video.js 10 Skins Challenge</span>
        <a href="./index.html">Open the workbench</a>
        <a href="#top">Back to the top</a>
      </footer>
    </>
  );
}
