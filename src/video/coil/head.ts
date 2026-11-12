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
  /** Leave out the eye, brow, nostril, mouth line, fangs and tongue (drawn as hand-placed pixels instead). */
  bare?: boolean;
  /** Draw the dark edge and light rim. Off for faint after-images. */
  outline?: boolean;
  /** Stripe colour at a distance from the neck (negative = on the head), so the body's stripe carries on. */
  sheenAt: (d: number) => string;
  /** Whether the body's dark band pattern falls at this distance. */
  bandAt: (d: number) => boolean;
  colors: HeadColors;
}

/** Neck to nose tip, in units of T. */
export const HEAD_LENGTH = 3.8;

export function drawHead(ctx: CanvasRenderingContext2D, o: HeadOptions): void {
  const { T, colors: C } = o;
  const jaw = Math.max(0, Math.min(1, o.jaw ?? 0));
  const u = (n: number) => n * T;

  // the skull, from the top of the neck, over the crown to the nose, and back along the upper lip to the jaw hinge
  const skullTop = () => {
    ctx.moveTo(u(-0.06), u(-0.5));
    ctx.bezierCurveTo(u(0.55), u(-0.5), u(0.95), u(-0.92), u(1.75), u(-0.9));
    ctx.bezierCurveTo(u(2.65), u(-0.88), u(3.4), u(-0.5), u(3.8), u(-0.07));
    ctx.lineTo(u(3.82), u(0.12));
  };
  const closed = () => {
    ctx.beginPath();
    skullTop();
    ctx.bezierCurveTo(u(3.2), u(0.55), u(2.2), u(0.82), u(1.4), u(0.8));
    ctx.bezierCurveTo(u(0.8), u(0.78), u(0.45), u(0.52), u(-0.06), u(0.5));
  };
  const upper = () => {
    ctx.beginPath();
    skullTop();
    ctx.lineTo(u(1.45), u(0.24));
    ctx.bezierCurveTo(u(1.0), u(0.56), u(0.5), u(0.5), u(-0.06), u(0.5));
  };
  const lower = () => {
    ctx.beginPath();
    ctx.moveTo(u(0.55), u(0.24));
    ctx.lineTo(u(3.6), u(0.2));
    ctx.bezierCurveTo(u(3.05), u(0.6), u(2.2), u(0.82), u(1.4), u(0.8));
    ctx.bezierCurveTo(u(0.95), u(0.8), u(0.62), u(0.6), u(0.32), u(0.5));
  };
  const hinge = { x: u(1.15), y: u(0.28) };
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
    ctx.moveTo(u(1.0), u(0.26));
    ctx.lineTo(u(3.4), u(0.23));
    ctx.lineTo(u(2.95), u(0.36));
    ctx.lineTo(u(1.35), u(0.4));
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
  ctx.bezierCurveTo(u(0.65), u(-0.44), u(1.1), u(-0.82), u(1.75), u(-0.8));
  ctx.bezierCurveTo(u(2.6), u(-0.78), u(3.3), u(-0.45), u(3.72), u(-0.05));
  ctx.lineTo(u(3.72), u(0.03));
  ctx.bezierCurveTo(u(2.95), u(-0.08), u(1.9), u(-0.14), u(-0.2), u(0.09));
  ctx.fillStyle = C.scale2;
  ctx.globalAlpha = 0.55; // a quieter crown than the body's back
  ctx.fill();
  ctx.globalAlpha = 1;

  // the iridescent stripe carries on from the body, over the crown, and thins out at the nose
  const stripeY = (x: number) => {
    return -0.24 - 0.28 * Math.sin(Math.min(1, Math.max(0, x) / 1.6) * Math.PI * 0.5);
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
  const shade = ctx.createLinearGradient(0, u(0.12), 0, u(0.82));
  shade.addColorStop(0, 'rgba(10,11,13,0)');
  shade.addColorStop(1, 'rgba(10,11,13,0.4)');
  ctx.fillStyle = shade;
  ctx.fillRect(u(1.0), u(0.12), u(2.8), u(0.75));
  ctx.restore();

  if (!o.bare) {
  // ---- features ----
  // brow ridge and eye
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(1, T * 0.07);
  ctx.beginPath();
  ctx.moveTo(u(2.05), u(-0.66));
  ctx.lineTo(u(3.0), u(-0.52));
  ctx.stroke();
  const ey = o.narrow ? 0.055 : 0.1;
  ctx.beginPath();
  ctx.ellipse(u(2.55), u(-0.36), u(0.19), u(ey), 0.12, 0, Math.PI * 2);
  ctx.fillStyle = C.gold;
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.fillRect(u(2.53), u(-0.36 - ey), Math.max(1, u(0.055)), u(ey * 2));
  // nostril
  ctx.fillRect(u(3.55), u(-0.08), Math.max(1, u(0.07)), Math.max(1, u(0.05)));

  if (open) {
    // fangs
    ctx.fillStyle = '#ECE8DF';
    for (const fx of [3.3, 2.85]) {
      ctx.beginPath();
      ctx.moveTo(u(fx - 0.07), u(0.14));
      ctx.lineTo(u(fx + 0.07), u(0.13));
      ctx.lineTo(u(fx - 0.02), u(0.14 + 0.3 * jaw));
      ctx.fill();
    }
  } else {
    // the line of the mouth
    ctx.beginPath();
    ctx.moveTo(u(3.82), u(0.13));
    ctx.quadraticCurveTo(u(2.6), u(0.3), u(1.45), u(0.32));
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(1, T * 0.06);
    ctx.stroke();
  }

  if (o.tongue) {
    ctx.strokeStyle = '#E0613F';
    ctx.lineWidth = Math.max(1, T * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(u(3.8), u(0.1));
    ctx.lineTo(u(4.4), u(0.12));
    ctx.lineTo(u(4.65), u(-0.04));
    ctx.moveTo(u(4.4), u(0.12));
    ctx.lineTo(u(4.65), u(0.28));
    ctx.stroke();
  }

  }

  ctx.restore();
}

/**
 * The face as hand-placed pixels, for the pixel-art snakes. `at(lx, ly)` turns a point on the head (in units of T:
 * the neck centre is 0,0, +x runs to the nose, +y to the jaw) into a buffer pixel; `px(x, y, colour)` sets one pixel.
 * `big` draws the larger eye for a large snake.
 */
export function drawPixelFace(
  at: (lx: number, ly: number) => [number, number],
  px: (x: number, y: number, colour: string) => void,
  o: { jaw?: number; tongue?: boolean; narrow?: boolean; size: number; colors: HeadColors }
): void {
  const C = o.colors;
  const jaw = Math.max(0, Math.min(1, o.jaw ?? 0));
  const line = (x0: number, y0: number, x1: number, y1: number, colour: string) => {
    const [ax, ay] = at(x0, y0);
    const [bx, by] = at(x1, y1);
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
    for (let i = 0; i <= n; i++) px(Math.round(ax + ((bx - ax) * i) / n), Math.round(ay + ((by - ay) * i) / n), colour);
  };

  // brow ridge, a hard line over the eye
  line(2.05, -0.7, 3.0, -0.56, C.ink);

  // The eye: gold, with a black vertical slit, a bright glint top left and a darker gold bottom right. It is drawn as a
  // little sprite whose size follows the snake's (`size` is the body's width in art pixels), so it stays clear.
  // When straining, it narrows to a slit under a heavy lid.
  const eye =
    o.size >= 8
      ? o.narrow
        ? ['iiiii', 'ggkgg']
        : ['.gkg.', 'hgkgg', 'ggkgs', '.gkg.']
      : o.size >= 5.5
        ? o.narrow
          ? ['iii', 'gkg']
          : ['gkg', 'hkg', 'gks']
        : o.narrow
          ? ['iii', 'gkg']
          : ['hkg', 'gks'];
  const cols: Record<string, string> = { i: C.ink, g: C.gold, h: '#fff3c4', s: '#b87400', k: C.ink };
  const [ex, ey] = at(2.55, -0.38);
  const ox = Math.floor(eye[0].length / 2);
  const oy = Math.floor(eye.length / 2);
  eye.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const key = row[c];
      if (key !== '.') px(ex - ox + c, ey - oy + r, cols[key]);
    }
  });

  // nostril
  const [nx, ny] = at(3.55, -0.07);
  px(nx, ny, C.ink);

  if (jaw > 0.05) {
    // fangs hang from the upper jaw, longer as the mouth opens wider
    const long = jaw > 0.5 ? 3 : 2;
    for (const fx of [3.32, 2.88]) {
      const [x, y] = at(fx, 0.2);
      for (let k = 0; k < long; k++) px(x, y + k, '#ece8df');
    }
  } else {
    // the line of the mouth, from the nose back under the eye, with a darker corner
    line(3.78, 0.14, 1.45, 0.33, C.ink);
    const [cx, cy] = at(1.45, 0.33);
    px(cx - 1, cy, C.ink);
  }

  if (o.tongue) {
    const red = '#e0613f';
    line(3.8, 0.12, 4.3, 0.12, red);
    line(4.3, 0.12, 4.55, -0.04, red);
    line(4.3, 0.12, 4.55, 0.28, red);
  }
}
