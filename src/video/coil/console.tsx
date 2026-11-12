/** @jsxImportSource react */

/**
 * COIL console layout: the video is the screen of a handheld game, and the controls are its pad.
 *
 *   HUD      SCORE (current time, as rolling digit tiles with an XP bar) · STAGE (chapter) · GOAL (duration)
 *   SCREEN   the video (rendered by the skin, above this component in the DOM)
 *   LANE     the snake playfield = the time slider
 *   PAD      A (play/pause) and B (mute) · option keys (CC, OPT, PIP, FULL) · D-pad (seek ±10, volume ±)
 *
 * Every control is a stock Video.js component or a plain button, so keyboard, labels and state stay intact.
 * In fullscreen the console lies over the picture and hides while the video plays.
 */

import {
  Controls,
  FullscreenButton as FullscreenButtonPrimitive,
  PiPButton as PiPButtonPrimitive,
  PlayButton as PlayButtonPrimitive,
  SeekButton as SeekButtonPrimitive,
  Time,
  Tooltip,
} from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import { Button } from '../shared/button';
import { CaptionsButton } from '../shared/captions-button';
import { MuteButton } from '../shared/mute-button';
import { SettingsMenu } from '../shared/settings-menu';
import { TimeSlider, type ThumbnailSlot } from '../shared/time-slider';
import { Title } from '../shared/title';
import { CoilIdleSnake } from './coil-idle';
import {
  FullscreenEnterIcon,
  FullscreenExitIcon,
  PauseIcon,
  PipEnterIcon,
  PipExitIcon,
  PlayIcon,
  RestartIcon,
} from './icons';
import { StageGatesContext, stageAt, useStages } from './stages';

/** A control with its printed label underneath, like the legends on a game pad. */
function Key({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`coil-key${className ? ` ${className}` : ''}`}>
      {children}
      <span className="coil-key-label" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}

function VolumeStep({ direction }: { direction: 1 | -1 }) {
  const store = usePlayer();
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const availability = usePlayer((s) => s.volumeAvailability);
  const up = direction > 0;
  // iPhone ignores script-set volume: the key stays in place but is disabled, and B (mute) still works.
  const disabled = availability === 'unsupported';

  return (
    <button
      type="button"
      className={`media-button coil-dpad-key coil-dpad-${up ? 'up' : 'down'}`}
      aria-label={up ? 'Volume up' : 'Volume down'}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return;
        const base = muted ? 0 : volume;
        const next = Math.max(0, Math.min(1, Math.round((base + direction * 0.1) * 10) / 10));
        store.setVolume(next);
        if (muted && up) store.setMuted(false);
      }}
    >
      <span aria-hidden="true">{up ? 'VOL+' : 'VOL-'}</span>
    </button>
  );
}

function SeekKey({ seconds }: { seconds: number }) {
  const back = seconds < 0;
  return (
    <SeekButtonPrimitive
      render={<Button />}
      className={`coil-dpad-key coil-dpad-${back ? 'left' : 'right'}`}
      seconds={seconds}
    >
      <span aria-hidden="true">{back ? '-10' : '+10'}</span>
    </SeekButtonPrimitive>
  );
}

function clock(seconds: number, long: boolean): string {
  const s = Math.max(0, Math.floor(seconds));
  const ss = String(s % 60).padStart(2, '0');
  if (!long) return `${Math.floor(s / 60)}:${ss}`;
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${ss}`;
}

/** A time shown as arcade counter tiles. A tile re-mounts when its digit changes, which rolls the new digit in. */
function Digits({ text }: { text: string }) {
  return (
    <span className="coil-digits" aria-hidden="true">
      {text.split('').map((ch, i) =>
        ch === ':' ? (
          <span key={`sep${i}`} className="coil-digit-sep">
            :
          </span>
        ) : (
          <span key={`${text.length - i}-${ch}`} className="coil-digit">
            {ch}
          </span>
        )
      )}
    </span>
  );
}

/** SCORE is the timecode: digit tiles that roll as it adds up, a "+N" chip per bite, and an XP bar toward the goal. */
function Score() {
  const sec = usePlayer((s) => Math.floor(s.currentTime));
  const duration = usePlayer((s) => s.duration);
  const known = Number.isFinite(duration) && duration > 0;
  // The "+N" chip pops when the snake on the lane has eaten (or coughed up) that much time, not on a clock tick.
  const ref = useRef<HTMLDivElement>(null);
  const [gain, setGain] = useState({ id: 0, delta: 0 });
  useEffect(() => {
    const skin = ref.current?.closest('.media-skin');
    if (!skin) return;
    const onScore = (event: Event) => {
      const delta = (event as CustomEvent<number>).detail;
      if (delta) setGain((g) => ({ id: g.id + 1, delta }));
    };
    skin.addEventListener('coil-score', onScore);
    return () => skin.removeEventListener('coil-score', onScore);
  }, []);
  const delta = gain.delta;
  const chip = gain.id > 0;

  return (
    <div ref={ref} className="coil-hud-cell coil-score">
      <span className="coil-hud-label" aria-hidden="true">
        SCORE
      </span>
      <Digits text={clock(sec, known && duration >= 3600)} />
      <Time.Value className="coil-sr" type="current" />
      <span
        className="coil-xp"
        aria-hidden="true"
        style={{ width: `${known ? Math.min(100, (sec / duration) * 100) : 0}%` }}
      />
      {chip && (
        <span key={`d${gain.id}`} className="coil-score-delta" data-negative={delta < 0 || undefined} aria-hidden="true">
          {delta > 0 ? `+${delta}` : delta}
        </span>
      )}
    </div>
  );
}

function Goal() {
  const duration = usePlayer((s) => s.duration);
  const known = Number.isFinite(duration) && duration > 0;

  return (
    <div className="coil-hud-cell coil-hud-cell-end">
      <span className="coil-hud-label" aria-hidden="true">
        GOAL
      </span>
      <Digits text={known ? clock(duration, duration >= 3600) : '-:--'} />
      <Time.Value className="coil-sr" type="duration" />
    </div>
  );
}

/**
 * The middle of the HUD. With chapters it is the STAGE button: stage number and name, and pressing it shows or hides
 * the stage gates on the lane. Without chapters it is the video's title.
 */
function StageBadge({ gates, onToggle }: { gates: boolean; onToggle: () => void }) {
  const stages = useStages();
  const sec = usePlayer((s) => Math.floor(s.currentTime));
  if (stages.length === 0) return <Title />;

  const index = stageAt(stages, sec);

  return (
    <button
      type="button"
      className="media-button coil-stage"
      aria-pressed={gates}
      aria-label={`Stage gates. Stage ${index + 1} of ${stages.length}: ${stages[index].title}`}
      onClick={onToggle}
    >
      <span className="coil-stage-tab" aria-hidden="true">
        STAGE {index + 1}/{stages.length}
      </span>
      <span key={index} className="coil-stage-name" aria-hidden="true">
        {stages[index].title}
      </span>
      <span className="coil-stage-led" aria-hidden="true" />
    </button>
  );
}

/** Restart the press flash on the key that was just activated. */
function flashKey(event: MouseEvent<HTMLDivElement>) {
  const key = (event.target as Element).closest('button');
  if (!key) return;
  key.removeAttribute('data-pressed');
  void key.offsetWidth; // restart the animation on repeated presses
  key.setAttribute('data-pressed', '');
  window.setTimeout(() => key.removeAttribute('data-pressed'), 320);
}

export function CoilConsole({ renderThumbnail }: ThumbnailSlot = {}) {
  const paused = usePlayer((s) => s.paused);
  const ended = usePlayer((s) => s.ended);
  const muted = usePlayer((s) => s.muted);
  const fullscreen = usePlayer((s) => s.isFullscreen);
  const [gates, setGates] = useState(true);
  const playLabel = ended ? 'A · AGAIN' : paused ? 'A · PLAY' : 'A · PAUSE';

  return (
    // In fullscreen the console lies over the picture, so there it follows the player's auto-hide.
    <Controls.Root visibility={fullscreen ? 'auto' : 'always'}>
      <Controls.Content className="coil-console">
        <Tooltip.Provider>
          <StageGatesContext.Provider value={gates}>
            <div className="coil-hud">
              <Score />
              <StageBadge gates={gates} onToggle={() => setGates((on) => !on)} />
              <Goal />
            </div>

            <div
              className="coil-lane"
              onPointerUpCapture={(event) => {
                // the slider takes focus for itself as the pointer lets go, so hand it on just after
                const skin = event.currentTarget.closest<HTMLElement>('.media-skin');
                window.setTimeout(() => {
                  if (skin?.querySelector('.coil-lane')?.contains(document.activeElement)) skin.focus({ preventScroll: true });
                }, 80);
              }}
            >
              <TimeSlider renderThumbnail={renderThumbnail} />
            </div>

            {/* every key flashes when pressed, by mouse, touch or keyboard */}
            <div className="coil-pad" onClick={flashKey}>
              <Controls.Group className="coil-ab" aria-label="Playback">
                <Key label={playLabel} className="coil-key-a">
                  <PlayButtonPrimitive render={<Button />} className="media-play-button coil-a">
                    <RestartIcon className="media-button-icon-base media-play-button-restart-icon" />
                    <PlayIcon className="media-button-icon-base media-play-button-play-icon" />
                    <PauseIcon className="media-button-icon-base media-play-button-pause-icon" />
                  </PlayButtonPrimitive>
                </Key>
                <Key label={muted ? 'B · SOUND' : 'B · MUTE'} className="coil-key-b">
                  <MuteButton className="coil-b" />
                </Key>
              </Controls.Group>

              <Controls.Group className="coil-options" aria-label="Options">
                <Key label="CC">
                  <CaptionsButton className="coil-option" />
                </Key>
                <Key label="OPT" className="coil-option-menu">
                  <SettingsMenu />
                </Key>
                <Key label="PIP">
                  <PiPButtonPrimitive render={<Button />} className="media-pip-button coil-option">
                    <PipEnterIcon className="media-button-icon media-pip-button-enter-icon" />
                    <PipExitIcon className="media-button-icon media-pip-button-exit-icon" />
                  </PiPButtonPrimitive>
                </Key>
                <Key label="FULL">
                  <FullscreenButtonPrimitive render={<Button />} className="media-fullscreen-button coil-option">
                    <FullscreenEnterIcon className="media-button-icon media-fullscreen-button-enter-icon" />
                    <FullscreenExitIcon className="media-button-icon media-fullscreen-button-exit-icon" />
                  </FullscreenButtonPrimitive>
                </Key>
              </Controls.Group>

              <Controls.Group className="coil-dpad" aria-label="Seek and volume">
                <VolumeStep direction={1} />
                <SeekKey seconds={-10} />
                <span className="coil-dpad-hub" aria-hidden="true" />
                <SeekKey seconds={10} />
                <VolumeStep direction={-1} />
              </Controls.Group>
            </div>
          </StageGatesContext.Provider>
        </Tooltip.Provider>
      </Controls.Content>
    </Controls.Root>
  );
}

/**
 * A ten-step volume meter that appears on the screen whenever the volume or mute changes. It is decorative: the
 * player's own status announcer speaks the change.
 */
function VolumeMeter() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const [shown, setShown] = useState(false);
  const last = useRef({ volume, muted });

  useEffect(() => {
    if (last.current.volume === volume && last.current.muted === muted) return;
    last.current = { volume, muted };
    setShown(true);
    const timer = window.setTimeout(() => setShown(false), 1500);
    return () => window.clearTimeout(timer);
  }, [volume, muted]);

  const percent = muted ? 0 : Math.round(volume * 100);
  const level = Math.round(percent / 10);

  return (
    <div className="coil-vol" data-shown={shown || undefined} data-muted={muted || undefined} aria-hidden="true">
      <span className="coil-vol-label">{muted ? 'MUTE' : 'VOL'}</span>
      <span className="coil-vol-bars">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="coil-vol-bar" data-on={i < level || undefined} style={{ height: 6 + i * 2 }} />
        ))}
      </span>
      <span className="coil-vol-label coil-vol-number">{percent}</span>
    </div>
  );
}

/** What the screen says on top of the video: title screen, paused, loading, stage clear, game over, volume meter. */
export function CoilScreenOverlay() {
  const store = usePlayer();
  const paused = usePlayer((s) => s.paused);
  const ended = usePlayer((s) => s.ended);
  const waiting = usePlayer((s) => s.waiting);
  const duration = usePlayer((s) => s.duration);
  const error = usePlayer((s) => s.error);
  const ref = useRef<HTMLDivElement>(null);

  // The player reports "not started" again when a paused video is taken back to 0:00; the game has still begun.
  const startedNow = usePlayer((s) => s.started);
  const [begun, setBegun] = useState(startedNow);
  useEffect(() => setBegun(false), [duration]);
  useEffect(() => {
    if (startedNow) setBegun(true);
  }, [startedNow, duration]);
  const started = begun || startedNow;

  // START, PLAY AGAIN and CONTINUE? leave the screen when pressed, which would drop keyboard focus to the page and
  // switch the shortcuts off. Hand focus on: to the A key for a keyboard press, to the player for a click.
  const keepFocus = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target as Element).closest('button')) return;
    const skin = event.currentTarget.closest<HTMLElement>('.media-skin');
    const next = event.detail === 0 ? skin?.querySelector<HTMLElement>('.coil-a') : skin;
    next?.focus({ preventScroll: true });
  };

  // Once the error dialog is closed the video is still broken, so the screen says so instead of offering START.
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (error) setFailed(true);
  }, [error]);
  useEffect(() => {
    if (started && !error && !paused) setFailed(false);
  }, [started, error, paused]);

  const state = error
    ? 'error'
    : failed
      ? 'failed'
      : ended
        ? 'clear'
        : !started
          ? 'start'
          : waiting
            ? 'loading'
            : paused
              ? 'paused'
              : 'playing';
  const total = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0;

  const retry = () => {
    setFailed(false);
    const media = ref.current?.closest('.media-skin')?.querySelector('video');
    try {
      media?.load();
    } catch {
      // the source may be gone; play() below reports it again
    }
    void Promise.resolve(store.play()).catch(() => undefined);
  };

  return (
    <div ref={ref} className="coil-overlay" data-state={state} onClick={keepFocus}>
      {state === 'start' && (
        <div className="coil-title-screen">
          <CoilIdleSnake />
          <PlayButtonPrimitive render={<Button />} className="coil-start">
            <PlayIcon className="coil-start-icon" />
            <span aria-hidden="true">PRESS START</span>
          </PlayButtonPrimitive>
        </div>
      )}
      {state === 'paused' && (
        <div className="coil-pause" aria-hidden="true">
          <p className="coil-banner coil-blink">PAUSED</p>
          <p className="coil-pause-stats">
            <span className="coil-pause-label">SCORE</span>
            <Time.Value type="current" />
            <span className="coil-pause-label">GOAL</span>
            <Time.Value type="duration" />
          </p>
        </div>
      )}
      {state === 'loading' && (
        <p className="coil-banner coil-loading" aria-hidden="true">
          LOADING
        </p>
      )}
      {state === 'clear' && (
        <div className="coil-clear">
          <p className="coil-banner coil-banner-gold" aria-hidden="true">
            STAGE CLEAR
          </p>
          <p className="coil-clear-score" aria-hidden="true">
            SCORE {clock(total, total >= 3600)}
          </p>
          <PlayButtonPrimitive render={<Button />} className="coil-start">
            <RestartIcon className="coil-start-icon" />
            <span aria-hidden="true">PLAY AGAIN</span>
          </PlayButtonPrimitive>
        </div>
      )}
      {state === 'failed' && (
        <div className="coil-clear">
          <p className="coil-banner coil-banner-red" aria-hidden="true">
            GAME OVER
          </p>
          <p className="coil-clear-score" aria-hidden="true">
            NO SIGNAL
          </p>
          <button type="button" className="media-button coil-start" onClick={retry}>
            <RestartIcon className="coil-start-icon" />
            <span>CONTINUE?</span>
          </button>
        </div>
      )}
      <VolumeMeter />
    </div>
  );
}
