import { MuxVideo } from '@videojs/react/media/mux-video';
import { VideoPlayer } from '@videojs/react/video';

import { VideoSkin } from '@/video/skin';

import type { PlaybackProps } from '../shell/params';

// What the preview plays: Ganesh's 2026 showreel on Mux (public playback ID). Any Mux or HLS URL works here.
const PLAYBACK_ID = 'cIfeUUvOtvTx4u1vBjo1lPse00cqzO7TDxrDEX9DFUgE';
const SRC = `https://stream.mux.com/${PLAYBACK_ID}.m3u8`;
const POSTER = `https://image.mux.com/${PLAYBACK_ID}/thumbnail.webp?time=7.5&width=1920`;
/** Chapters (the STAGE names and lane flags) and captions about each piece, served from `apps/preview/public`. */
const CHAPTERS = './showreel-chapters.vtt';
const ABOUT = './showreel-about.vtt';

/** `media` carries the workbench's playback options: autoplay, muted, loop, and preload. */
export function Player({ media }: { media?: PlaybackProps }) {
  return (
    <VideoPlayer poster={POSTER}>
      <VideoSkin>
        <MuxVideo {...media} src={SRC} playsInline crossOrigin="">
          <track kind="chapters" label="English" srcLang="en" src={CHAPTERS} default />
          <track kind="captions" label="About the work" srcLang="en" src={ABOUT} />
        </MuxVideo>
      </VideoSkin>
    </VideoPlayer>
  );
}
