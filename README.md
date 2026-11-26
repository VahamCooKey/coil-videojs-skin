# HISS: a snake-game skin for Video.js v10

A complete video player skin for [Video.js v10](https://videojs.org) (React + CSS), designed as a handheld game console. The progress bar is a snake: the video is laid out as pellets, the snake eats them as the video plays, and every control is a console button.

Live: https://ganeshdg.com/hiss · Built for the Video.js skin challenge on Contra.

## What it does

- **The lane is the timeline.** Each pellet is a stretch of the video, from one second on a short clip up to five minutes on a long film. The head bites each pellet it reaches and SCORE ticks over.
- **Drag the snake to seek.** Grab the head and pull back to rewind (the snake coughs pellets back onto the lane) or push forward to skip ahead (it swallows them).
- **D-pad seeking.** +10 dashes the snake ahead, swallowing every pellet it passes; −10 sends it back.
- **Preview on hover.** Pointing at the lane shows a preview frame, the time and the chapter name.
- **Pause is a game pause.** The frame dims under a panel with SCORE and GOAL and the snake ties itself in a knot. Leave it paused and the knot strains, shakes and gives up.
- **Volume you can see.** Louder sound sends a bigger, faster wave down the snake's body.
- **Captions** on a solid plate in the pixel face.
- **Settings as an in-game menu.** An arrow cursor follows the arrow keys and Escape backs out; the speed menu scrolls on short screens.
- **Loading, ended and error screens.** A snake chases its tail while the video loads; the end screen counts time and stages cleared and A becomes PLAY AGAIN; on an error, CONTINUE? retries and screen readers hear the full message.
- **Three layouts.** Narrow screens stack the pad under a 60 px lane. Sideways phones become a handheld with A and B under the left thumb and the D-pad under the right, with a Fit/Fill zoom in fullscreen. Desktop gets a thin HUD on top and the lane and keys in one row, both hiding when the mouse rests.

## Accessibility

Every control is keyboard operable and labelled, with a visible focus ring, in the same order it appears on screen. Hotkeys: Space or K to play and pause, left and right arrows or J and L to seek, up and down for volume, 0 to 9 to jump from 0% to 90%, C for captions, M for mute, F for fullscreen, I for picture in picture, and `<` `>` for speed. A status announcer reads changes aloud, and the skin respects reduced motion.

## How it's built

- `src/video/coil/`: the console: snake renderer (`coil-snake.tsx`), pellet stages (`stages.ts`), pixel grid (`pixel.ts`), head states and art (`head.ts`, `assets/`), idle and loading animations, and CSS per state and layout.
- `src/video/behaviors/`: hotkeys and gestures.
- `src/video/shared/`: buttons, menus, indicators, captions and the error dialog.
- `apps/preview/`: the Video.js workbench used to develop the skin, plus the HISS showcase page (`src/hiss/`).

Fonts: Jersey 15 and Atkinson Hyperlegible Next and Mono (via Fontsource). Demo media: NASA's Cosmic Dawn trailer, streamed from Mux.

## Run it

```sh
npm install
npm run dev        # workbench with the skin in a live player
npm run build      # production build in dist/
npm run typecheck
```

The workbench's options panel sets the player size, aspect ratio, colour scheme, text direction, language and playback options. Settings live in the URL, so `/?width=384&ratio=9:16` opens it in that state.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Built on the Video.js Scaffold skin.

Made by Ganesh Datta G · https://ganeshdg.com
