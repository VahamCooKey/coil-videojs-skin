/** @jsxImportSource react */

'use client';

import '@fontsource/jersey-15';
import '../styles/video/scaffold.css';
import './skin.css';
import './coil/coil.css';
import './coil/coil-screens.css';
import './coil/coil-hud.css';
import './coil/coil-states.css';
import './coil/coil-landscape.css';
import './coil/coil-finish.css';
import { Container as ContainerPrimitive, Poster as PosterPrimitive, Slider as SliderPrimitive } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import { Fragment, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import { cn } from '@/lib/resolve-class-name';

import { VideoHotkeys } from './behaviors/hotkeys';
import { CoilConsole, CoilScreenOverlay } from './coil/console';
import { ErrorDialog } from './shared/error-dialog';
import { Indicators } from './shared/indicators';
import { StatusAnnouncer } from './shared/status-announcer';
import { Poster } from './shared/video-feedback';

export interface VideoSkinProps extends Omit<ContainerPrimitive.Props, 'children'> {
  children?: ReactNode;
  renderPoster?: PosterPrimitive.ImageProps['render'];
  renderThumbnail?: SliderPrimitive.Thumbnail.ImageProps['render'];
}

/**
 * COIL: a game-console skin. The video sits in the screen; the HUD, snake lane and pad are always visible around it,
 * so nothing covers the picture. In fullscreen the console lies over the picture and hides while the video plays.
 */
export function VideoSkin({ children, className, renderPoster, renderThumbnail, ...props }: VideoSkinProps = {}) {
  const store = usePlayer();
  const fullscreen = usePlayer((s) => s.isFullscreen);
  const skinRef = useRef<HTMLDivElement>(null);

  // CONTINUE? after an error: mount the media again, so it loads its source from scratch, then play.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const skin = skinRef.current?.closest('.media-skin');
    if (!skin) return;
    const onRetry = () => setAttempt((n) => n + 1);
    skin.addEventListener('coil-retry', onRetry);
    return () => skin.removeEventListener('coil-retry', onRetry);
  }, []);
  useEffect(() => {
    if (attempt === 0) return;
    const timer = window.setTimeout(() => void Promise.resolve(store.play()).catch(() => undefined), 400);
    return () => window.clearTimeout(timer);
  }, [attempt, store]);

  // A press that closes an open menu must not also reach the screen as a play or pause.
  // (The menu closes itself on the press, before this component hears about it, so remember when it last closed.)
  const menuClosedAt = useRef(0);
  useEffect(() => {
    const skin = skinRef.current?.closest('.media-skin');
    const pad = skin?.querySelector('.coil-pad');
    if (!pad) return;
    const seen = new MutationObserver((changes) => {
      for (const change of changes) {
        if ((change.target as Element).getAttribute('aria-expanded') !== 'true') menuClosedAt.current = performance.now();
      }
    });
    seen.observe(pad, { attributes: true, attributeFilter: ['aria-expanded'], subtree: true });
    return () => seen.disconnect();
  }, []);

  // Pointer shortcuts on the screen (the pad holds the real controls). They are scoped to the screen so that a click
  // on an empty part of the pad does nothing.
  //   click                      play or pause
  //   double-click               fullscreen
  //   double-tap, left or right  back or forward 10 seconds
  const onScreenClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    if (performance.now() - menuClosedAt.current < 500) return;
    if (target.closest('button, a, [role="slider"], [role="dialog"], [role="alertdialog"]')) return;
    const media = event.currentTarget.querySelector('video');
    const toggle = () => {
      if (!media || media.paused) void Promise.resolve(store.play()).catch(() => undefined);
      else store.pause();
    };

    toggle(); // the second click of a double-click undoes the first click's toggle
    if (event.detail !== 2) return;

    const box = event.currentTarget.getBoundingClientRect();
    const where = (event.clientX - box.left) / box.width;
    const touch = (event.nativeEvent as PointerEvent).pointerType === 'touch';
    if (touch && media && (where < 1 / 3 || where > 2 / 3)) {
      void store.seek(Math.max(0, media.currentTime + (where < 1 / 3 ? -10 : 10)));
    } else if (fullscreen) {
      void Promise.resolve(store.exitFullscreen()).catch(() => undefined);
    } else {
      void Promise.resolve(store.requestFullscreen()).catch(() => undefined);
    }
  };

  return (
    <ContainerPrimitive
      className={cn('media-skin', 'media-container', 'media-video', 'coil', className)}
      data-theme="scaffold"
      data-preset="video"
      {...props}
    >
      <div
        ref={skinRef}
        className="coil-screen"
        onClick={onScreenClick}
      >
        <Fragment key={attempt}>{children}</Fragment>
        <Poster renderImage={renderPoster} />
        <Indicators />
        <CoilScreenOverlay />
        {/* inside the screen, so an error covers the picture and leaves the console in view */}
        <ErrorDialog />
      </div>
      <CoilConsole renderThumbnail={renderThumbnail} />

      <VideoHotkeys />
      <StatusAnnouncer />
    </ContainerPrimitive>
  );
}
