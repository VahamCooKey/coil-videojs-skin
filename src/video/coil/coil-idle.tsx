/** @jsxImportSource react */

/**
 * COIL: the snake on the title screen. It sits coiled with its head raised on an S-shaped neck, idling above
 * PRESS START. Decorative only (aria-hidden). One continuous body from tail tip to head, with the same skin as the
 * lane snake: sheen and bands are placed by distance from the head.
 */

import { useEffect, useRef } from 'react';

import headRest from './assets/head-rest.svg?url';
import headTongue from './assets/head-tongue.svg?url';
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
const HEAD_SCALE = T / 24;
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
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rest = new Image();
    rest.src = headRest;
    const tongue = new Image();
    tongue.src = headTongue;
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
        const nk = Math.min(1, d / 56);
        ctx.globalAlpha = 0.3 + 0.7 * nk;
        seg(i, w * 0.5, C.scale2, w * 0.16, 2.2);
        ctx.globalAlpha = 1;
        if (nk < 1) seg(i, w, `rgba(10,11,13,${(0.3 * (1 - nk)).toFixed(3)})`, 0, 2.2);
        const si = Math.floor(((((d - shift) / SHEEN_PERIOD) % 1) + 1) * 96) % 96;
        ctx.globalAlpha = 0.4 + 0.6 * Math.min(1, d / 48);
        seg(i, Math.max(2, w * 0.28), SHEEN[si], w * 0.24, 2.2);
        ctx.globalAlpha = 1;
        if (d % BAND_EVERY < 3.4 && w > 7 && d > 30) seg(i, w * 0.92, C.band);
      }

      // head, continuous with the neck: it faces along the neck's direction, with a slow tongue flick
      const beat = t % 3.2;
      const flick = !reduce && ((beat > 0.3 && beat < 0.5) || (beat > 0.66 && beat < 0.86));
      const img = flick && tongue.complete ? tongue : rest;
      const n0 = pts[0];
      const n1 = pts[2];
      // the body carries on a few px under the head
      {
        const len = Math.hypot(n0.x - n1.x, n0.y - n1.y) || 1;
        ctx.lineCap = 'butt';
        ctx.strokeStyle = '#262c35';
        ctx.lineWidth = T;
        ctx.beginPath();
        ctx.moveTo(n0.x, n0.y);
        ctx.lineTo(n0.x + ((n0.x - n1.x) / len) * 10, n0.y + ((n0.y - n1.y) / len) * 10);
        ctx.stroke();
      }
      if (img.complete && img.naturalWidth) {
        ctx.save();
        ctx.translate(n0.x, n0.y);
        ctx.rotate(Math.atan2(n0.y - n1.y, n0.x - n1.x));
        // the same dark edge and light rim as the body, on every side except the neck
        const px = canvas.width / W;
        ctx.shadowBlur = 0;
        for (const [color, r] of [['rgba(236,232,223,0.62)', 2.5], [C.ink, 1.5]] as const) {
          ctx.shadowColor = color;
          for (const [ox, oy] of [[1, 0], [0, 1], [0, -1], [0.7, 0.7], [0.7, -0.7]]) {
            ctx.shadowOffsetX = ox * r * px;
            ctx.shadowOffsetY = oy * r * px;
            ctx.drawImage(img, -3, -32 * HEAD_SCALE, 96 * HEAD_SCALE, 64 * HEAD_SCALE);
          }
        }
        ctx.shadowColor = 'transparent';
        ctx.drawImage(img, -3, -32 * HEAD_SCALE, 96 * HEAD_SCALE, 64 * HEAD_SCALE);
        ctx.restore();
      }

      if (!reduce) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    // the head art loads after the first frame; draw once more so a still (reduced-motion) frame has its head
    rest.onload = () => {
      if (motion.matches) requestAnimationFrame(draw);
    };
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="coil-idle" width={W} height={H} aria-hidden="true" />;
}
