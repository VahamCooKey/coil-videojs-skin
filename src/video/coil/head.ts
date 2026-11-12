/**
 * COIL: the snake's head, drawn on the canvas from the same layers as the body (dark edge, skin, lighter back,
 * iridescent stripe, bands), so the head and the neck are one continuous animal with no join.
 *
 * Local coordinates: the origin is the centre of the neck, +x points forward, +y is the belly side. One unit = T, the
 * body's thickness. The caller translates and rotates the context to the neck first.
 */

export interface HeadColors {
  ink: string;
  scale1: string;
  scale2: string;
  band: string;
  rim: string;
  gold: string;
}

export interface HeadOptions {
  /** Body thickness in px. */
  T: number;
  /** 0 = mouth shut, 1 = wide open. */
  jaw?: number;
  /** Forked tongue out. */
  tongue?: boolean;
  /** Eye narrowed, when straining. */
  narrow?: boolean;
  /** Draw the dark edge and light rim. Off for faint after-images. */
  outline?: boolean;
  /** Stripe colour at a distance from the neck (negative = on the head), so the body's stripe carries on. */
  sheenAt: (d: number) => string;
  /** Whether the body's dark band pattern falls at this distance. */
  bandAt: (d: number) => boolean;
  colors: HeadColors;
}

/** Neck to nose tip, in units of T. */
export const HEAD_LENGTH = 3.2;

export function drawHead(ctx: CanvasRenderingContext2D, o: HeadOptions): void {
  const { T, colors: C } = o;
  const jaw = Math.max(0, Math.min(1, o.jaw ?? 0));
  const u = (n: number) => n * T;

  // the skull, from the top of the neck, over the crown to the nose, and back along the upper lip to the jaw hinge
  const skullTop = () => {
    ctx.moveTo(u(-0.06), u(-0.5));
    ctx.bezierCurveTo(u(0.6), u(-0.5), u(0.9), u(-0.72), u(1.5), u(-0.7));
    ctx.bezierCurveTo(u(2.25), u(-0.68), u(2.85), u(-0.4), u(3.2), u(-0.06));
    ctx.lineTo(u(3.22), u(0.1));
  };
  const closed = () => {
    ctx.beginPath();
    skullTop();
    ctx.bezierCurveTo(u(2.7), u(0.42), u(1.9), u(0.6), u(1.2), u(0.6));
    ctx.bezierCurveTo(u(0.7), u(0.6), u(0.4), u(0.5), u(-0.06), u(0.5));
  };
  const upper = () => {
    ctx.beginPath();
    skullTop();
    ctx.lineTo(u(1.25), u(0.2));
    ctx.bezierCurveTo(u(0.9), u(0.52), u(0.5), u(0.5), u(-0.06), u(0.5));
  };
  const lower = () => {
    ctx.beginPath();
    ctx.moveTo(u(0.5), u(0.2));
    ctx.lineTo(u(3.05), u(0.16));
    ctx.bezierCurveTo(u(2.6), u(0.44), u(1.9), u(0.6), u(1.2), u(0.6));
    ctx.bezierCurveTo(u(0.8), u(0.6), u(0.55), u(0.52), u(0.3), u(0.46));
  };
  const hinge = { x: u(1.0), y: u(0.24) };
  const open = jaw > 0.02;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';

  const edge = (shape: () => void) => {
    if (o.outline === false) return;
    // open paths: the neck end is never stroked, so no line is drawn across the join
    shape();
    ctx.strokeStyle = C.rim;
    ctx.lineWidth = 5;
    ctx.stroke();
    shape();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3;
    ctx.stroke();
  };

  // ---- lower jaw, swung open about its hinge ----
  if (open) {
    ctx.save();
    ctx.translate(hinge.x, hinge.y);
    ctx.rotate(jaw * 0.62);
    ctx.translate(-hinge.x, -hinge.y);
    edge(lower);
    lower();
    ctx.fillStyle = C.scale1;
    ctx.fill();
    // inside of the mouth
    ctx.beginPath();
    ctx.moveTo(u(0.9), u(0.22));
    ctx.lineTo(u(2.9), u(0.19));
    ctx.lineTo(u(2.5), u(0.3));
    ctx.lineTo(u(1.2), u(0.34));
    ctx.fillStyle = '#5a1f24';
    ctx.fill();
    ctx.restore();
  }

  // ---- skull ----
  const shape = open ? upper : closed;
  edge(shape);
  shape();
  ctx.fillStyle = C.scale1;
  ctx.fill();

  ctx.save();
  shape();
  ctx.clip();

  // the lighter back, the same band the body has, narrowing to the nose
  ctx.beginPath();
  ctx.moveTo(u(-0.2), u(-0.09));
  ctx.lineTo(u(-0.2), u(-0.41));
  ctx.bezierCurveTo(u(0.7), u(-0.42), u(1.0), u(-0.62), u(1.5), u(-0.6));
  ctx.bezierCurveTo(u(2.2), u(-0.58), u(2.8), u(-0.32), u(3.15), u(-0.04));
  ctx.lineTo(u(3.15), u(0.03));
  ctx.bezierCurveTo(u(2.5), u(-0.06), u(1.6), u(-0.1), u(-0.2), u(0.09));
  ctx.fillStyle = C.scale2;
  ctx.globalAlpha = 0.55; // a quieter crown than the body's back
  ctx.fill();
  ctx.globalAlpha = 1;

  // the iridescent stripe carries on from the body, over the crown, and thins out at the nose
  const stripeY = (x: number) => {
    const k = Math.max(0, Math.min(1, x / 3.1));
    const arch = Math.sin(Math.min(1, x / 1.5) * Math.PI * 0.5) * (1 - Math.max(0, (x - 1.5) / 1.6) ** 1.4);
    return -0.24 - 0.2 * arch + 0.2 * k * k;
  };
  for (let x = -0.2; x < 3.05; x += 0.1) {
    const k = Math.max(0, x / 3.05);
    ctx.beginPath();
    ctx.moveTo(u(x), u(stripeY(x)));
    ctx.lineTo(u(x + 0.13), u(stripeY(x + 0.1)));
    ctx.strokeStyle = o.sheenAt(-x * T);
    ctx.lineWidth = Math.max(1.5, T * 0.26 * (1 - 0.7 * k * k));
    // full strength where it leaves the neck, gone by the brow: the head itself stays plain
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, x) / 1.5);
    if (ctx.globalAlpha > 0.02) ctx.stroke();
  }
  ctx.globalAlpha = 1;


  // a soft shade under the jaw line gives the head its form without a hard edge
  const shade = ctx.createLinearGradient(0, u(0.1), 0, u(0.62));
  shade.addColorStop(0, 'rgba(10,11,13,0)');
  shade.addColorStop(1, 'rgba(10,11,13,0.4)');
  ctx.fillStyle = shade;
  ctx.fillRect(u(0.9), u(0.1), u(2.4), u(0.6));
  ctx.restore();

  // ---- features ----
  // brow ridge and eye
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(1, T * 0.07);
  ctx.beginPath();
  ctx.moveTo(u(1.85), u(-0.4));
  ctx.lineTo(u(2.62), u(-0.3));
  ctx.stroke();
  const ey = o.narrow ? 0.055 : 0.1;
  ctx.beginPath();
  ctx.ellipse(u(2.22), u(-0.22), u(0.19), u(ey), 0.12, 0, Math.PI * 2);
  ctx.fillStyle = C.gold;
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.fillRect(u(2.2), u(-0.22 - ey), Math.max(1, u(0.055)), u(ey * 2));
  // nostril
  ctx.fillRect(u(2.98), u(-0.07), Math.max(1, u(0.07)), Math.max(1, u(0.05)));

  if (open) {
    // fangs
    ctx.fillStyle = '#ECE8DF';
    for (const fx of [2.75, 2.35]) {
      ctx.beginPath();
      ctx.moveTo(u(fx - 0.07), u(0.14));
      ctx.lineTo(u(fx + 0.07), u(0.13));
      ctx.lineTo(u(fx - 0.02), u(0.14 + 0.3 * jaw));
      ctx.fill();
    }
  } else {
    // the line of the mouth
    ctx.beginPath();
    ctx.moveTo(u(3.2), u(0.1));
    ctx.quadraticCurveTo(u(2.2), u(0.2), u(1.3), u(0.22));
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(1, T * 0.06);
    ctx.stroke();
  }

  if (o.tongue) {
    ctx.strokeStyle = '#E0613F';
    ctx.lineWidth = Math.max(1, T * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(u(3.18), u(0.08));
    ctx.lineTo(u(3.75), u(0.1));
    ctx.lineTo(u(4.0), u(-0.04));
    ctx.moveTo(u(3.75), u(0.1));
    ctx.lineTo(u(4.0), u(0.22));
    ctx.stroke();
  }

  ctx.restore();
}
