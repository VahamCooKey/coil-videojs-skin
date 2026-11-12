/** @jsxImportSource react */

/**
 * COIL console layout: the video is the screen of a handheld game, and the controls are its pad.
 *
 *   HUD      SCORE (current time, ticking up) · title · GOAL (duration)
 *   SCREEN   the video (rendered by the skin, above this component in the DOM)
 *   LANE     the snake playfield = the time slider
 *   PAD      A (play/pause) and B (mute) · option keys (CC, OPT, PIP, FULL) · D-pad (seek ±10, volume ±)
 *
 * Every control is a stock Video.js component or a plain button, so keyboard, labels and state stay intact.
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

/** SCORE is the timecode. Each second it gains, the number bumps and a "+1" chip pops beside it, so it adds up. */
function Score() {
  const sec = usePlayer((s) => Math.floor(s.currentTime));
  const prev = useRef(sec);
  const delta = sec - prev.current;
  useEffect(() => {
    prev.current = sec;
  });

  return (
    <div className="coil-hud-cell">
      <span className="coil-hud-label" aria-hidden="true">
        SCORE
      </span>
      <span key={sec} className={delta !== 0 ? 'coil-score-bump' : undefined}>
        <Time.Value className="coil-hud-value" type="current" />
      </span>
      {delta !== 0 && (
        <span key={`d${sec}`} className="coil-score-delta" data-negative={delta < 0 || undefined} aria-hidden="true">
          {delta > 0 ? `+${delta}` : delta}
        </span>
      )}
    </div>
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
  const playLabel = ended ? 'A · AGAIN' : paused ? 'A · PLAY' : 'A · PAUSE';

  return (
    <Controls.Root visibility="always">
      <Controls.Content className="coil-console">
        <Tooltip.Provider>
          <div className="coil-hud">
            <Score />
            <Title />
            <div className="coil-hud-cell coil-hud-cell-end">
              <span className="coil-hud-label" aria-hidden="true">
                GOAL
              </span>
              <Time.Value className="coil-hud-value" type="duration" />
            </div>
          </div>

          <div className="coil-lane">
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
              <Key label="B · MUTE" className="coil-key-b">
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
        </Tooltip.Provider>
      </Controls.Content>
    </Controls.Root>
  );
}

/** A ten-step volume meter that appears on the screen whenever the volume or mute changes. */
function VolumeMeter() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const [shown, setShown] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setShown(true);
    const timer = window.setTimeout(() => setShown(false), 1500);
    return () => window.clearTimeout(timer);
  }, [volume, muted]);

  const level = muted ? 0 : Math.round(volume * 10);

  return (
    <div className="coil-vol" data-shown={shown || undefined} data-muted={muted || undefined}>
      <span className="coil-vol-label" aria-hidden="true">
        {muted ? 'MUTE' : 'VOL'}
      </span>
      <span className="coil-vol-bars" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="coil-vol-bar" data-on={i < level || undefined} style={{ height: 6 + i * 2 }} />
        ))}
      </span>
      <span className="coil-vol-label coil-vol-number" aria-hidden="true">
        {level}
      </span>
      <span className="coil-sr" role="status">
        {shown ? (muted ? 'Muted' : `Volume ${level * 10}%`) : ''}
      </span>
    </div>
  );
}

/** What the screen says on top of the video: title screen, paused, loading, stage clear, and the volume meter. */
export function CoilScreenOverlay() {
  const started = usePlayer((s) => s.started);
  const paused = usePlayer((s) => s.paused);
  const ended = usePlayer((s) => s.ended);
  const waiting = usePlayer((s) => s.waiting);
  const duration = usePlayer((s) => s.duration);

  const state = ended ? 'clear' : !started ? 'start' : waiting ? 'loading' : paused ? 'paused' : 'playing';
  const total = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0;
  const score = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

  return (
    <div className="coil-overlay" data-state={state}>
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
        <p className="coil-banner coil-blink" aria-hidden="true">
          LOADING
        </p>
      )}
      {state === 'clear' && (
        <div className="coil-clear">
          <p className="coil-banner coil-banner-gold" aria-hidden="true">
            STAGE CLEAR
          </p>
          <p className="coil-clear-score" aria-hidden="true">
            SCORE {score}
          </p>
          <PlayButtonPrimitive render={<Button />} className="coil-start">
            <RestartIcon className="coil-start-icon" />
            <span aria-hidden="true">PLAY AGAIN</span>
          </PlayButtonPrimitive>
        </div>
      )}
      <VolumeMeter />
    </div>
  );
}
