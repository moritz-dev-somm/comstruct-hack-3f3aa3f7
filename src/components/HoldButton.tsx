import { forwardRef, type ButtonHTMLAttributes } from "react";
import { useHoldRepeat } from "@/hooks/use-hold-repeat";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  onTick: () => void;
  /** Stop pointer/click events from bubbling (useful inside row triggers). */
  stopPropagation?: boolean;
};

/**
 * Button that fires `onTick` once when pressed and then repeatedly while held,
 * accelerating exponentially. Use anywhere you'd want a +/- to "auto-repeat".
 */
export const HoldButton = forwardRef<HTMLButtonElement, Props>(function HoldButton(
  { onTick, stopPropagation, type = "button", ...rest },
  ref,
) {
  const handlers = useHoldRepeat(onTick);
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      {...handlers}
      onPointerDown={(e) => {
        if (stopPropagation) e.stopPropagation();
        handlers.onPointerDown(e);
      }}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        e.preventDefault();
      }}
    />
  );
});
