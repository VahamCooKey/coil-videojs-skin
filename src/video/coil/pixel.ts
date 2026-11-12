/**
 * HISS pixel art: the snakes are drawn smooth into a small buffer, then every buffer pixel is snapped to one colour
 * from a fixed palette (no soft edges, no in-between shades) and the buffer is scaled up with no smoothing.
 * So the snake is made of the same hard square pixels as the icons and the type.
 */

/** Size of one art pixel, in CSS px. The 12×12 icons drawn at 24 px use 2 px pixels too. */
export const PIXEL = 2;

const HEX = [
  '#0a0b0d', // ink: outlines
  '#14181d', // shadow side
  '#2b323c', // skin
  '#46505c', // skin, lit
  '#5f6c7a', // back
  '#7d8996', // back, lit
  '#615f5a', // rim, and unlit pellets
  '#a7a399', // rim, bright
  '#ece8df', // bone: fangs, highlights
  '#ffb21e', // gold: eye, pellets
  '#b87400', // gold, shade
  '#fff3c4', // gold, hot
  '#ff4d3d', // red
  '#5a1f24', // mouth
  '#e0613f', // tongue
  '#3fd1c6', // sheen: teal
  '#2f9c95', // sheen: teal, shade
  '#5f86e0', // sheen: blue
  '#8b6cff', // sheen: violet
  '#6a52c2', // sheen: violet, shade
  '#b2817f', // sheen: rose
  '#d69a4a', // sheen: bronze
  '#a3753a', // sheen: bronze, shade
];

const PALETTE = HEX.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);

/** The colour semi-transparent pixels are judged against before they are made solid (the lane's own colour). */
const BACKDROP = [15, 18, 22];

const cache = new Map<number, number>();

function nearest(r: number, g: number, b: number): number {
  const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < PALETTE.length; i++) {
    const p = PALETTE[i];
    // weighted towards green, the way eyes are
    const d = 3 * (p[0] - r) ** 2 + 4 * (p[1] - g) ** 2 + 2 * (p[2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (cache.size > 40000) cache.clear();
  cache.set(key, best);
  return best;
}

/** Snap every pixel of the buffer to the palette, with hard edges. */
export function quantize(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  if (!w || !h) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < 60) {
      d[i + 3] = 0;
      continue;
    }
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    if (a < 250) {
      const k = a / 255;
      r = r * k + BACKDROP[0] * (1 - k);
      g = g * k + BACKDROP[1] * (1 - k);
      b = b * k + BACKDROP[2] * (1 - k);
    }
    const p = PALETTE[nearest(r | 0, g | 0, b | 0)];
    d[i] = p[0];
    d[i + 1] = p[1];
    d[i + 2] = p[2];
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** A small offscreen canvas for the art, and a way to blow it up onto the real canvas. */
export function makeBuffer() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return {
    canvas,
    ctx,
    /** Size the buffer for a target canvas of `cssW` × `cssH` CSS px. */
    resize(cssW: number, cssH: number) {
      const w = Math.max(1, Math.ceil(cssW / PIXEL));
      const h = Math.max(1, Math.ceil(cssH / PIXEL));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    },
    /**
     * Snap the buffer to the palette, clear the target and draw the buffer over it with no smoothing.
     * `scale` is how many target canvas pixels one art pixel covers.
     */
    present(target: CanvasRenderingContext2D, scale: number, after?: (art: CanvasRenderingContext2D) => void) {
      quantize(ctx, canvas.width, canvas.height);
      if (after) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        after(ctx);
        ctx.restore();
      }
      target.save();
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.clearRect(0, 0, target.canvas.width, target.canvas.height);
      target.imageSmoothingEnabled = false;
      target.drawImage(canvas, 0, 0, canvas.width * scale, canvas.height * scale);
      target.restore();
    },
  };
}
