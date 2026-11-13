import { useEffect, useRef } from 'react';

import { C, SHEEN } from '@/video/coil/coil-snake';

/**
 * The page's own lane, under the top bar: a pixel snake whose head is how far down the page you are. It eats the
 * pellets as you scroll, and each section is a flag that turns gold once passed. Decorative (aria-hidden); the nav
 * above it is the real way round the page.
 */
export function ScrollSnake({ stages }: { stages: readonly string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const U = 3; // one art pixel
    const ROWS = 7;
    let W = 0;
    let raf = 0;

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(ROWS * U * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };

    const px = (x: number, y: number, c: string, w = 1, h = 1) => {
      ctx.fillStyle = c;
      ctx.fillRect(x * U, y * U, w * U, h * U);
    };

    const draw = () => {
      raf = 0;
      const cells = Math.floor(W / U);
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      const start = 2;
      const end = cells - 4;
      const head = Math.round(start + p * (end - start));
      const mid = 3;
      ctx.clearRect(0, 0, W, ROWS * U);

      // flags: one per section, gold once the head has passed it
      for (const id of stages) {
        const el = document.getElementById(id);
        if (!el || max <= 0) continue;
        const f = Math.min(1, Math.max(0, (el.getBoundingClientRect().top + scrollY - 80) / max));
        const x = Math.round(start + f * (end - start));
        const passed = head >= x;
        px(x, 0, passed ? C.gold : '#5F6C7A', 1, ROWS);
        px(x + 1, 0, passed ? C.gold : '#5F6C7A', 2, 2);
      }

      // pellets still to eat
      for (let x = start + 2; x < end; x += 5) if (x > head + 3) px(x, mid, C.gold);

      // body: two rows thick, a gentle wave that moves as you scroll, sheen bands like the lane snake
      const phase = calm.matches ? 0 : scrollY / 40;
      for (let x = 0; x < head; x++) {
        const wy = calm.matches ? 0 : Math.round(Math.sin(x * 0.35 - phase) * 0.6);
        const band = Math.floor((head - x) / 3) % 6 === 0;
        const sheen = SHEEN[Math.floor((head - x) * 1.6) % SHEEN.length];
        px(x, mid - 1 + wy, band ? C.scale1 : sheen, 1, 1);
        px(x, mid + wy, C.scale1, 1, 1);
      }

      // head: four cells, gold eye, a tongue while scrolling
      px(head, mid - 1, C.scale2, 3, 2);
      px(head + 1, mid - 2, C.scale1, 2, 1);
      px(head + 3, mid - 1, C.scale2, 1, 2);
      px(head + 2, mid - 1, C.gold);
      if (!calm.matches && scrolling) px(head + 4, mid, C.red, 2, 1);
    };

    let scrolling = false;
    let still = 0;
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const onScroll = () => {
      scrolling = true;
      clearTimeout(still);
      still = window.setTimeout(() => {
        scrolling = false;
        queue();
      }, 160);
      queue();
    };

    size();
    draw();
    const ro = new ResizeObserver(() => {
      size();
      queue();
    });
    ro.observe(cv);
    ro.observe(document.body);
    addEventListener('scroll', onScroll, { passive: true });
    return () => {
      ro.disconnect();
      removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
      clearTimeout(still);
    };
  }, [stages]);

  return <canvas ref={ref} className="scroll-snake" aria-hidden="true" />;
}
