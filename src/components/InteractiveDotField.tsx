import { useEffect, useRef } from "react";

const GRID = 22;
const RADIUS = 140;
const BASE_ALPHA = 0.16;
const PEAK_ALPHA = 0.95;
const BASE_R = 0.9;
const PEAK_R = 1.6;

export function InteractiveDotField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const brandRgb =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--brand-rgb")
        .trim() || "121 22 21";

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const pointer = { x: -9999, y: -9999, active: false };
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const r2 = RADIUS * RADIUS;
      const px = pointer.active ? pointer.x : -9999;
      const py = pointer.active ? pointer.y : -9999;
      for (let y = GRID / 2; y < height; y += GRID) {
        for (let x = GRID / 2; x < width; x += GRID) {
          let f = 0;
          if (pointer.active) {
            const dx = x - px;
            const dy = y - py;
            const d2 = dx * dx + dy * dy;
            if (d2 < r2) {
              const t = 1 - Math.sqrt(d2) / RADIUS;
              f = t * t * (3 - 2 * t);
            }
          }
          const alpha = BASE_ALPHA + (PEAK_ALPHA - BASE_ALPHA) * f;
          const radius = BASE_R + (PEAK_R - BASE_R) * f;
          ctx.beginPath();
          ctx.fillStyle = `rgba(${brandRgb.replace(/\s+/g, ",")}, ${alpha})`;
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    let raf = 0;
    let dirty = false;
    const loop = () => {
      if (dirty) {
        draw();
        dirty = false;
      }
      raf = requestAnimationFrame(loop);
    };

    const onMove = (x: number, y: number) => {
      pointer.x = x;
      pointer.y = y;
      pointer.active = true;
      if (reduced) draw();
      else dirty = true;
    };
    const onLeave = () => {
      pointer.active = false;
      if (reduced) draw();
      else dirty = true;
    };

    const mouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const touchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) onMove(t.clientX, t.clientY);
    };

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", mouseMove, { passive: true });
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("touchmove", touchMove, { passive: true });
    window.addEventListener("touchend", onLeave);

    resize();
    if (!reduced) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", mouseMove);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
