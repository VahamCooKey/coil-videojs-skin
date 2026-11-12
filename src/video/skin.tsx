/** @jsxImportSource react */

'use client';

import '@fontsource/jersey-15';
import '../styles/video/scaffold.css';
import './skin.css';
import './coil/coil.css';
import './coil/coil-round4.css';
import './coil/coil-hud.css';
import { Container as ContainerPrimitive, Poster as PosterPrimitive, Slider as SliderPrimitive } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import type { MouseEvent, ReactNode } from 'react';

import { cn } from '@/lib/resolve-class-name';

import { VideoHotkeys } from './behaviors/hotkeys';
import { CoilConsole, CoilScreenOverlay } from './coil/console';
import { ErrorDialog } from './shared/error-dialog';
import { Indicators } from './shared/indicators';
import { SeekIndicator } from './shared/seek-indicator';
import { StatusAnnouncer } from './shared/status-announcer';
import { Poster } from './shared/video-feedback';

export interface VideoSkinProps extends Omit<ContainerPrimitive.Props, 'children'> {
  children?: ReactNode;
  renderPoster?: PosterPrimitive.ImageProps['render'];
  renderThumbnail?: SliderPrimitive.Thumbnail.ImageProps['render'];
}

/**
 * COIL: a game-console skin. The video sits in the screen; the HUD, snake lane and pad are always visible around it,
 * so nothing covers the picture and nothing auto-hides.
 */
export function VideoSkin({ children, className, renderPoster, renderThumbnail, ...props }: VideoSkinProps = {}) {
  const store = usePlayer();
  const paused = usePlayer((s) => s.paused);

  // Clicking the screen toggles playback (a pointer shortcut; the A key on the pad is the real control).
  const onScreenClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('button, a, [role="slider"], [role="dialog"]')) return;
    if (paused) void store.play();
    else store.pause();
  };

  return (
    <ContainerPrimitive
      className={cn('media-skin', 'media-container', 'media-video', 'coil', className)}
      data-theme="scaffold"
      data-preset="video"
      {...props}
    >
      <div className="coil-screen" onClick={onScreenClick}>
        {children}
        <Poster renderImage={renderPoster} />
        <Indicators>
          <SeekIndicator />
        </Indicators>
        <CoilScreenOverlay />
      </div>
      <ErrorDialog />
      <CoilConsole renderThumbnail={renderThumbnail} />

      <VideoHotkeys />
      <StatusAnnouncer />
    </ContainerPrimitive>
  );
}
