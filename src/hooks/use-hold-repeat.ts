import { useCallback, useEffect, useRef } from "react";

type Options = {
  /** Delay before repeat starts (ms). */
  initialDelay?: number;
  /** Interval between first repeats (ms). */
  startInterval?: number;
  /** Minimum interval — repeats won't go faster than this (ms). */
  minInterval?: number;
  /** Multiplier applied to interval after each tick (<1 = accelerate). */
  accel?: number;
  /** Disable hold-repeat behaviour. */
  disabled?: boolean;
};

/**
 * Returns pointer/keyboard handlers that fire `onTick` once on press and then
 * repeatedly while the button is held, getting exponentially faster.
 *
 * Spread onto any element: `<button {...useHoldRepeat(() => adjust(+1))} />`.
 */
export function useHoldRepeat(onTick: () => void, opts: Options = {}) {
  const {
    initialDelay = 350,
    startInterval = 180,
    minInterval = 25,
    accel = 0.82,
    disabled = false,
  } = opts;

  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const intervalRef = useRef(startInterval);

  const clear = useCallback(() => {
    activeRef.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const schedule = useCallback(() => {
    if (!activeRef.current) return;
    timeoutRef.current = setTimeout(() => {
      if (!activeRef.current) return;
      tickRef.current();
      intervalRef.current = Math.max(minInterval, intervalRef.current * accel);
      schedule();
    }, intervalRef.current);
  }, [accel, minInterval]);

  const start = useCallback(
    (e?: React.SyntheticEvent) => {
      if (disabled) return;
      if (e && "button" in e && (e as React.MouseEvent).button !== undefined && (e as React.MouseEvent).button !== 0) {
        return;
      }
      clear();
      activeRef.current = true;
      intervalRef.current = startInterval;
      tickRef.current();
      timeoutRef.current = setTimeout(() => {
        schedule();
      }, initialDelay);
    },
    [disabled, clear, schedule, initialDelay, startInterval],
  );

  useEffect(() => clear, [clear]);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      start(e);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => {
      // Long-press on touch can trigger context menu; suppress to avoid stuck repeat.
      e.preventDefault();
      clear();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && !e.repeat) start(e);
    },
    onKeyUp: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") clear();
    },
    onBlur: clear,
    // No onClick — the first tick already fired on press.
  };
}
