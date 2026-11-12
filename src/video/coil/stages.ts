/**
 * COIL stages: the video's chapters, read from the player store, plus the "show stage gates on the lane" switch that
 * the HUD's STAGE button controls and the snake lane reads.
 */

import { usePlayer } from '@videojs/react/video';
import { createContext, useMemo } from 'react';

export interface Stage {
  start: number;
  end: number;
  title: string;
}

interface CueLike {
  startTime: number;
  endTime: number;
  text?: string;
}

const NONE: readonly Stage[] = [];

/** The chapters of the current video, in order. Empty when the video has none. */
export function useStages(): readonly Stage[] {
  // the same list the stock time slider draws its chapter segments from
  const cues = usePlayer((s) => (s as unknown as { chaptersCues?: readonly CueLike[] }).chaptersCues);

  return useMemo(() => {
    if (!cues || cues.length < 2) return NONE;
    return cues.map((cue) => ({ start: cue.startTime, end: cue.endTime, title: cue.text ?? '' }));
  }, [cues]);
}

/** Which stage a time falls in, as an index into the list (0 when before the first). */
export function stageAt(stages: readonly Stage[], time: number): number {
  let index = 0;
  for (let i = 0; i < stages.length; i++) if (time >= stages[i].start - 0.05) index = i;
  return index;
}

export const StageGatesContext = createContext(true);
