import { useEffect, useRef } from "react";

const GRID = 22;
const RADIUS = 140;
const BASE_ALPHA = 0.16;
const PEAK_ALPHA = 0.45;
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

    const isOverBackground = (x: number, y: number) => {
      // Temporarily allow elementFromPoint to see through the canvas
      const prevPE = canvas.style.pointerEvents;
      canvas.style.pointerEvents = "none";
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      canvas.style.pointerEvents = prevPE;
      if (!el) return true;
      let node: HTMLElement | null = el;
      while (node && node !== document.body && node !== document.documentElement) {
        if (node.dataset?.dotField === "allow") return true;
        if (node.dataset?.dotField === "block") return false;
        const tag = node.tagName;
        if (
          tag === "BUTTON" ||
          tag === "A" ||
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          tag === "LABEL" ||
          node.getAttribute("role") === "button"
        ) {
          return false;
        }
        const bg = getComputedStyle(node).backgroundColor;
        const m = bg.match(/rgba?\(([^)]+)\)/);
        if (m) {
          const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
          const alpha = parts.length === 4 ? parts[3] : 1;
          if (alpha > 0.01) return false;
        }
        node = node.parentElement;
      }
      return true;
    };

    const mouseMove = (e: MouseEvent) => {
      if (!isOverBackground(e.clientX, e.clientY)) return onLeave();
      onMove(e.clientX, e.clientY);
    };
    const touchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (!isOverBackground(t.clientX, t.clientY)) return onLeave();
      onMove(t.clientX, t.clientY);
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
