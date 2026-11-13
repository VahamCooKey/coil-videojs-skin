import { useEffect, useRef } from 'react';

import { C, SHEEN } from '@/video/coil/coil-snake';

export type Sky = 'night' | 'dawn' | 'paper';

/**
 * The hero backdrop, drawn at one art pixel = 4 screen pixels: a sky in ordered-dither bands, a moon or sun, three
 * ridges of hills, and a small snake crawling along the far ridge. Decorative (aria-hidden). With reduced motion it
 * draws one still frame. "paper" draws nothing (the CSS gives a plain bright page).
 */
const S = 4;

// 4x4 Bayer matrix, thresholds 0..15
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const THEMES = {
  night: {
    sky: ['#0b0a1e', '#151133', '#24194b', '#3a2160', '#5a2a6a', '#8a3a6e', '#c4566e'],
    disc: { color: '#ece8df', shade: '#b9b3a6', x: 0.9, y: 0.07, r: 13 },
    hills: ['#2a1a4e', '#1c1536', '#14171b'],
    stars: ['#ece8df', '#ffb21e', '#8b6cff'],
  },
  dawn: {
    sky: ['#9fb4ff', '#b8b9ff', '#d4bdf7', '#f0c3e6', '#ffcfd2', '#ffdcc0', '#fff0d2'],
    disc: { color: '#fff6dc', shade: '#ffd27a', x: 0.9, y: 0.12, r: 18 },
    hills: ['#c6b2f2', '#9d86dc', '#6e5bb8'],
    stars: [],
  },
} as const;

function ridge(cols: number, base: number, amp: number, seed: number) {
  const ys: number[] = [];
  for (let x = 0; x < cols; x++) {
    const v =
      Math.sin(x * 0.045 + seed) * 0.55 + Math.sin(x * 0.11 + seed * 2.3) * 0.3 + Math.sin(x * 0.27 + seed * 4.1) * 0.15;
    ys.push(Math.round(base - v * amp));
  }
  // flat steps of 2+ cells, like hand-placed tiles
  for (let x = 1; x < cols; x += 2) ys[x] = ys[x - 1];
  return ys;
}

export function PixelSky({ sky }: { sky: Sky }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d', { willReadFrequently: true });
    if (!cv || !ctx || sky === 'paper') return;
    const theme = THEMES[sky];
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    let cols = 0;
    let rows = 0;
    let raf = 0;
    let base: ImageData | null = null;
    let hills: number[][] = [];
    let stars: { x: number; y: number; c: string; p: number }[] = [];

    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

    const build = () => {
      cols = Math.max(1, Math.ceil(cv.clientWidth / S));
      rows = Math.max(1, Math.ceil(cv.clientHeight / S));
      cv.width = cols;
      cv.height = rows;
      ctx.imageSmoothingEnabled = false;

      // sky: each band dithers into the next
      const img = ctx.createImageData(cols, rows);
      const bands = theme.sky.map(hex);
      const horizon = rows * 0.72;
      for (let y = 0; y < rows; y++) {
        const f = Math.min(0.999, Math.max(0, y / horizon)) * (bands.length - 1);
        const i = Math.floor(f);
        const t = f - i;
        for (let x = 0; x < cols; x++) {
          const pick = t * 16 > BAYER[(y % 4) * 4 + (x % 4)] ? bands[Math.min(i + 1, bands.length - 1)] : bands[i];
          const o = (y * cols + x) * 4;
          img.data[o] = pick[0];
          img.data[o + 1] = pick[1];
          img.data[o + 2] = pick[2];
          img.data[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);

      // moon / sun: a hard disc with a dithered shade on one side
      const d = theme.disc;
      const cx = Math.round(cols * d.x);
      const cy = Math.round(rows * d.y);
      for (let y = -d.r; y <= d.r; y++)
        for (let x = -d.r; x <= d.r; x++) {
          const q = x * x + y * y;
          if (q > d.r * d.r) continue;
          const shade = x + y > d.r * 0.55 && (x + y > d.r * 0.9 || BAYER[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)] > 7);
          ctx.fillStyle = shade ? d.shade : d.color;
          ctx.fillRect(cx + x, cy + y, 1, 1);
        }
      if (sky === 'night') {
        ctx.fillStyle = d.shade;
        for (const [x, y, r] of [
          [-4, -3, 2],
          [3, 4, 3],
          [5, -5, 1],
        ])
          ctx.fillRect(cx + x, cy + y, r, r);
      }

      // hills, far to near
      hills = [
        ridge(cols, rows * 0.66, rows * 0.1, 1.3),
        ridge(cols, rows * 0.8, rows * 0.08, 4.2),
        ridge(cols, rows * 0.93, rows * 0.05, 7.7),
      ];
      hills.forEach((ys, k) => {
        ctx.fillStyle = theme.hills[k];
        ys.forEach((y, x) => ctx.fillRect(x, y, 1, rows - y));
        // a lit edge on the far ridge
        if (k === 0) {
          ctx.fillStyle = sky === 'night' ? '#4a2f78' : '#e2d3ff';
          ys.forEach((y, x) => ctx.fillRect(x, y, 1, 1));
        }
      });
      base = ctx.getImageData(0, 0, cols, rows);

      // stars only above the far ridge
      stars = [];
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const n = theme.stars.length ? Math.round((cols * rows) / 900) : 0;
      for (let i = 0; i < n; i++) {
        const x = Math.floor(rnd() * cols);
        const y = Math.floor(rnd() * rows * 0.6);
        if (y < hills[0][x] - 2) stars.push({ x, y, c: theme.stars[Math.floor(rnd() * theme.stars.length)], p: rnd() * 6 });
      }
    };

    const frame = (now: number) => {
      raf = 0;
      if (!base) return;
      ctx.putImageData(base, 0, 0);
      const t = calm.matches ? 0 : now / 1000;
      for (const s of stars) {
        const on = calm.matches || Math.sin(t * 1.3 + s.p) > -0.4;
        if (!on) continue;
        ctx.fillStyle = s.c;
        ctx.fillRect(s.x, s.y, 1, 1);
        if (Math.sin(t * 0.7 + s.p * 3) > 0.92) {
          ctx.fillRect(s.x - 1, s.y, 3, 1);
          ctx.fillRect(s.x, s.y - 1, 1, 3);
        }
      }
      // the crawler: a 22-cell snake on the far ridge, one cell every 90 ms
      const ys = hills[0];
      const len = 22;
      const span = cols + len + 40;
      const head = Math.floor((calm.matches ? cols * 0.62 : (now / 90) % span)) - 10;
      for (let i = len; i >= 0; i--) {
        const x = head - i;
        if (x < 0 || x >= cols) continue;
        const wy = calm.matches ? 0 : Math.round(Math.sin((x + now / 120) * 0.5) * 0.6);
        const y = ys[x] - 2 + (i > 2 ? wy : 0);
        ctx.fillStyle = i % 5 === 0 ? C.scale1 : SHEEN[(i * 6) % SHEEN.length];
        ctx.fillRect(x, y, 1, 2);
      }
      if (head >= 0 && head < cols) {
        ctx.fillStyle = C.scale2;
        ctx.fillRect(head, ys[head] - 3, 2, 3);
        ctx.fillStyle = C.gold;
        ctx.fillRect(head + 1, ys[head] - 3, 1, 1);
      }
      if (!calm.matches) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      build();
      raf = requestAnimationFrame(frame);
    };

    start();
    const ro = new ResizeObserver(start);
    ro.observe(cv);
    // pause the loop while the hero is off screen
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !raf) raf = requestAnimationFrame(frame);
      else if (!e.isIntersecting) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    io.observe(cv);
    calm.addEventListener('change', start);
    return () => {
      ro.disconnect();
      io.disconnect();
      calm.removeEventListener('change', start);
      cancelAnimationFrame(raf);
    };
  }, [sky]);

  if (sky === 'paper') return null;
  return <canvas ref={ref} className="sky" aria-hidden="true" />;
}

/** A dithered edge between two bands: rows of a 4x4 Bayer ramp from `from` to `to`, drawn as one tiny SVG. */
export function ditherEdge(from: string, to: string, rows = 8) {
  let rects = '';
  for (let y = 0; y < rows; y++) {
    const level = ((y + 0.5) / rows) * 16;
    for (let x = 0; x < 4; x++) if (level > BAYER[(y % 4) * 4 + x]) rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="${rows}" shape-rendering="crispEdges"><rect width="4" height="${rows}" fill="${from}"/><g fill="${to}">${rects}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
