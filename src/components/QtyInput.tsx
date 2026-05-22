import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  max?: number;
  ariaLabel?: string;
};

/**
 * Inline editable quantity field. Renders as a centered tabular-nums number
 * that can be focused/clicked to type a new quantity. Enter or blur commits;
 * Escape reverts. Empty or 0 calls onChange(0) (caller decides to remove).
 */
export function QtyInput({ value, onChange, className, max = 999, ariaLabel = "Quantity" }: Props) {
  const [draft, setDraft] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Keep input in sync when external value changes (e.g. +/− buttons)
    if (document.activeElement !== ref.current) setDraft(String(value));
  }, [value]);

  const commit = () => {
    const n = draft === "" ? 0 : Math.min(max, Math.max(0, parseInt(draft, 10) || 0));
    setDraft(String(n));
    if (n !== value) onChange(n);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      setDraft(String(value));
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={onKey}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "h-full bg-transparent text-center tabular-nums font-bold outline-none focus:bg-accent/50",
        className,
      )}
    />
  );
}
