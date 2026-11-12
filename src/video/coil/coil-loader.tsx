/** @jsxImportSource react */

/**
 * COIL: the loading sign. The snake runs in a ring, chasing its own tail and snapping at it.
 * Decorative only (aria-hidden); the player's status announcer speaks the state. Under reduced motion it is a still ring.
 */

import { useEffect, useRef } from 'react';

import { BAND_EVERY, C, SHEEN, SHEEN_PERIOD } from './coil-snake';
import { drawHead, drawPixelFace, HEAD_LENGTH } from './head';
import { makeBuffer, PIXEL } from './pixel';

const SIZE = 132;
const T = 10;
const R = 42;
const STEP = 2;
/** How deep the bends in the path are. */
const WAVE = 3.4;
/** The light edge round the snake: with no plate behind it, this is what separates it from dark footage. */
const RIM = 'rgba(236,232,223,0.62)';
/** The head is straight, so it lies along a chord of the ring: this is the angle that chord spans. */
const HEAD_SPAN = 2 * Math.asin((HEAD_LENGTH * T) / (2 * R));

export function CoilLoader() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const out = canvas?.getContext('2d');
    if (!canvas || !out) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    // pixel art: drawn smooth into a buffer where one art pixel is 2 units, snapped to the palette, blown up
    const ART = 2;
    const buf = makeBuffer();
    buf.resize((SIZE / ART) * PIXEL, (SIZE / ART) * PIXEL);
    const ctx = buf.ctx;
    ctx.setTransform(1 / ART, 0, 0, 1 / ART, 0, 0);

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const start = performance.now();
    // Each loading screen gets its own path: two sets of bends of different sizes, starting at random places and
    // drifting round at different slow speeds, so the snake never bends at the same spots twice.
    const seed = [Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28];
    const bend = (ang: number, t: number) =>
      0.6 * Math.sin(ang * 7 + seed[0] + t * 0.45) +
      0.3 * Math.sin(ang * 4 - seed[1] - t * 0.31) +
      0.25 * Math.sin(ang * 11 + seed[2] + t * 0.23);
    let raf = 0;

    const draw = (now: number) => {
      const reduce = motion.matches;
      const t = reduce ? 0 : (now - start) / 1000;
      const c = SIZE / 2;
      const a = t * 2.6 - Math.PI / 2; // where the neck is; it runs clockwise
      const snap = reduce ? 0 : 0.5 + 0.5 * Math.sin(t * 7); // 1 = lunging at the tail
      const gap = 0.34 - 0.2 * snap; // angle between the nose and the tail tip
      const bodyAngle = 2 * Math.PI - HEAD_SPAN - gap;
      const length = bodyAngle * R;

      ctx.clearRect(0, 0, SIZE, SIZE);

      // body, from the tail tip to the neck, so nearer the head is drawn later
      const at = (d: number) => {
        const ang = a - d / R;
        // the last stretch of tail quivers, more toward the tip, as if it knows what is coming
        const tip = Math.max(0, 1 - (length - d) / 30);
        // The path itself is wavy and stays put, and the body travels along it, so each part of the snake bends as
        // it reaches a curve: it slithers round the ring rather than spinning like a rigid wheel.
        const wave = reduce ? 0 : bend(ang, t) * WAVE * Math.min(1, (d + 8) / 26);
        const r = R + wave + (reduce ? 0 : Math.sin(t * 22 + d * 0.35) * 2.2 * tip * tip);
        return { x: c + r * Math.cos(ang), y: c + r * Math.sin(ang), ox: Math.cos(ang), oy: Math.sin(ang) };
      };
      const seg = (d: number, width: number, color: string, offset = 0, back = 0) => {
        const p = at(d);
        const q = at(Math.min(length, d + STEP + back));
        ctx.lineCap = 'butt';
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(p.x + p.ox * offset, p.y + p.oy * offset);
        ctx.lineTo(q.x + q.ox * offset, q.y + q.oy * offset);
        ctx.stroke();
      };
      const shift = t * 6;
      for (let d = length - STEP; d >= -2 * STEP; d -= STEP) {
        const w = T * Math.min(1, 0.14 + (length - d) / 44);
        seg(d, w + 6, RIM, 0, 1);
        seg(d, w + 3, C.ink, 0, 1);
        seg(d, w, C.scale1, 0, 1.5);
        seg(d, w * 0.5, C.scale2, w * 0.16, 1.5);
        seg(d, Math.max(2, w * 0.26), SHEEN[Math.floor(((((d - shift) / SHEEN_PERIOD) % 1) + 1) * 96) % 96], w * 0.24, 1.5);
        if (d % BAND_EVERY < 3 && w > 6 && d > 0) {
          ctx.globalAlpha = Math.min(1, d / 30);
          seg(d, w * 0.92, C.band);
          ctx.globalAlpha = 1;
        }
      }

      // head: along the chord ahead of the neck, jaw opening as it lunges for the tail
      const neck = at(0);
      ctx.save();
      ctx.translate(neck.x, neck.y);
      // along the path at the neck: the ring's tangent, tipped by the slope of the bend it is on (kept gentle, so
      // the head steers rather than flicks)
      const slope = reduce ? 0 : ((bend(a + 0.01, t) - bend(a - 0.01, t)) / 0.02) * WAVE * (8 / 26);
      const headRot = a + Math.PI / 2 + HEAD_SPAN * 0.3 - Math.atan(slope / R);
      const jaw = reduce ? 0.6 : 0.25 + 0.75 * snap;
      ctx.rotate(headRot);
      drawHead(ctx, {
        T,
        bare: true,
        jaw,
        sheenAt: (d) => SHEEN[Math.floor(((((d - shift) / SHEEN_PERIOD) % 1) + 1) * 96) % 96],
        bandAt: () => false,
        colors: { ...C, rim: RIM },
      });
      ctx.restore();
      {
        const hx = neck.x;
        const hy = neck.y;
        const rot = headRot;
        const cs = Math.cos(rot) * T;
        const sn = Math.sin(rot) * T;
        buf.present(out, ART * dpr, (art) =>
          drawPixelFace(
            (lx, ly) => [Math.round((hx + lx * cs - ly * sn) / ART), Math.round((hy + lx * sn + ly * cs) / ART)],
            (x, y, colour) => {
              art.fillStyle = colour;
              art.fillRect(x, y, 1, 1);
            },
            { jaw, colors: C }
          )
        );
      }

      if (!reduce) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="coil-loader" width={SIZE} height={SIZE} aria-hidden="true" />;
}
