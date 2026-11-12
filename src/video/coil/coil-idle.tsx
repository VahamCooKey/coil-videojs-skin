/** @jsxImportSource react */

/**
 * COIL: the snake on the title screen. It sits coiled with its head raised on an S-shaped neck, idling above
 * PRESS START. Decorative only (aria-hidden). One continuous body from tail tip to head, with the same skin as the
 * lane snake: sheen and bands are placed by distance from the head.
 */

import { useEffect, useRef } from 'react';

import { drawHead, drawPixelFace } from './head';
import { makeBuffer, PIXEL } from './pixel';
import { BAND_EVERY, C, SHEEN, SHEEN_PERIOD } from './coil-snake';

const W = 360;
const H = 210;
const T = 20;
const R_OUT = 52;
const R_IN = 14;
const TURNS = 2;
const PSI_MAX = TURNS * 2 * Math.PI;
const TAIL = 96;
const STEP = 2.5;
const CX = 160;
const CY = 124;

const TWINKLES = [
  [38, 60, 0],
  [76, 26, 1.7],
  [304, 150, 0.9],
  [328, 96, 2.6],
  [262, 186, 3.4],
  [24, 138, 4.1],
];

export function CoilIdleSnake() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const out = canvas?.getContext('2d');
    if (!canvas || !out) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    // pixel art: drawn smooth into a buffer where one art pixel is 3 units, snapped to the palette, blown up
    const ART = 3;
    const buf = makeBuffer();
    buf.resize((W / ART) * PIXEL, (H / ART) * PIXEL);
    const ctx = buf.ctx;
    ctx.setTransform(1 / ART, 0, 0, 1 / ART, 0, 0);

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const start = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      const reduce = motion.matches;
      const t = reduce ? 0 : (now - start) / 1000;
      const breathe = 1 + Math.sin(t * 1.8) * 0.022;
      const rOut = R_OUT * breathe;
      const rIn = R_IN * breathe;
      const floor = CY + rOut;

      // ---- centreline, head to tail: raised neck, then the coil from its centre outward, then the tail ----------
      const raw: [number, number][] = [];
      const swayX = Math.sin(t * 1.1) * 5;
      const swayY = Math.sin(t * 1.7) * 3;
      const p0 = [CX + 46 + swayX, CY - 74 + swayY];
      const p1 = [CX + 2 + swayX, CY - 74 + swayY];
      const p2 = [CX + 44, CY + rIn];
      const p3 = [CX, CY + rIn];
      for (let i = 0; i <= 48; i++) {
        const s = i / 48;
        const m = 1 - s;
        raw.push([
          m * m * m * p0[0] + 3 * m * m * s * p1[0] + 3 * m * s * s * p2[0] + s * s * s * p3[0],
          m * m * m * p0[1] + 3 * m * m * s * p1[1] + 3 * m * s * s * p2[1] + s * s * s * p3[1],
        ]);
      }
      for (let i = 1; i <= 240; i++) {
        const psi = (i / 240) * PSI_MAX;
        const r = rIn + (rOut - rIn) * (psi / PSI_MAX);
        raw.push([CX - r * Math.sin(psi), CY + r * Math.cos(psi)]);
      }
      for (let i = 1; i <= 40; i++) {
        const d = (i / 40) * TAIL;
        raw.push([CX - d, floor - Math.sin(d * 0.07 - t * 2.4) * 3 * Math.min(1, d / 30)]); // the tail tip wags
      }

      // resample at an even step so the bands and sheen are evenly spaced
      const pts: { x: number; y: number; d: number; w: number }[] = [{ x: raw[0][0], y: raw[0][1], d: 0, w: T }];
      let carry = 0;
      let dist = 0;
      for (let i = 1; i < raw.length; i++) {
        const [ax, ay] = raw[i - 1];
        const [bx, by] = raw[i];
        const seg = Math.hypot(bx - ax, by - ay);
        let at = STEP - carry;
        while (at <= seg) {
          pts.push({ x: ax + ((bx - ax) * at) / seg, y: ay + ((by - ay) * at) / seg, d: dist + at, w: T });
          at += STEP;
        }
        carry = (carry + seg) % STEP;
        dist += seg;
      }
      const total = pts[pts.length - 1].d;
      for (const p of pts) p.w = T * Math.min(1, 0.16 + (total - p.d) / 46);

      ctx.clearRect(0, 0, W, H);

      // ground shadow and a few twinkling pellets
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(CX - 14, floor + T / 2 + 3, 104, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const [x, y, ph] of TWINKLES) {
        const k = reduce ? 0.7 : 0.5 + 0.5 * Math.sin(t * 2.2 + ph);
        const size = 3 + Math.round(k * 4);
        ctx.fillStyle = k > 0.75 ? C.goldHot : C.gold;
        ctx.globalAlpha = 0.35 + k * 0.65;
        ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
      }
      ctx.globalAlpha = 1;

      const seg = (i: number, width: number, color: string, offset = 0, back = 0) => {
        const a = pts[i];
        const b = pts[i + 1];
        const tx = b.x - a.x;
        const ty = b.y - a.y;
        const len = Math.hypot(tx, ty) || 1;
        const ox = (-ty / len) * offset;
        const oy = (tx / len) * offset;
        ctx.lineCap = 'butt';
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a.x + ox, a.y + oy);
        ctx.lineTo(b.x + ox + (tx / len) * back, b.y + oy + (ty / len) * back);
        ctx.stroke();
      };

      // painter order, tail to head: each inner turn rests on the one outside it, and the neck rises over the coil
      const shift = t * 30;
      for (let i = pts.length - 2; i >= 0; i--) {
        const w = pts[i + 1].w;
        const d = pts[i].d;
        seg(i, w + 6, 'rgba(236,232,223,0.62)', 0, 1.8);
        seg(i, w + 3, C.ink, 0, 1.8);
        seg(i, w, C.scale1, 0, 2.2);
        seg(i, w * 0.5, C.scale2, w * 0.16, 2.2);
        const si = Math.floor(((((d - shift) / SHEEN_PERIOD) % 1) + 1) * 96) % 96;
        seg(i, Math.max(2, w * 0.28), SHEEN[si], w * 0.24, 2.2);
        if (d % BAND_EVERY < 3.4 && w > 7) seg(i, w * 0.92, C.band);
      }

      // head: drawn from the same layers as the body, facing along the neck, with a slow tongue flick
      const beat = t % 3.2;
      const flick = !reduce && ((beat > 0.3 && beat < 0.5) || (beat > 0.66 && beat < 0.86));
      const n0 = pts[0];
      const n1 = pts[2];
      const headRot = Math.atan2(n0.y - n1.y, n0.x - n1.x);
      ctx.save();
      ctx.translate(n0.x, n0.y);
      ctx.rotate(headRot);
      drawHead(ctx, {
        T,
        bare: true,
        tongue: flick,
        sheenAt: (d) => SHEEN[Math.floor(((((d - shift) / SHEEN_PERIOD) % 1) + 1) * 96) % 96],
        bandAt: (d) => ((d % BAND_EVERY) + BAND_EVERY) % BAND_EVERY < 3.4,
        colors: { ...C, rim: 'rgba(236,232,223,0.62)' },
      });
      ctx.restore();
      {
        const hx = n0.x;
        const hy = n0.y;
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
            { tongue: flick, big: T / ART >= 6, colors: C }
          )
        );
      }

      if (!reduce) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="coil-idle" width={W} height={H} aria-hidden="true" />;
}
