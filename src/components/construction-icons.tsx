/**
 * Construction icon set — original line-drawn SVGs inspired by the user's
 * reference sheet (compass, gear, shovel, excavator, jackhammer, road, crane,
 * blueprint, tools, barrier, wheelbarrow, cone).
 *
 * All icons use `currentColor` so you can tint them via Tailwind text-* classes
 * (e.g. text-brand, text-white, text-foreground, text-muted-foreground).
 * Stroke is non-scaling so they read crisply at any size.
 *
 * Pair with a colored tile (bg-brand / bg-foreground / bg-muted / bg-card)
 * and an `IconTile` wrapper for the SubBase-style look.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number | string };

const base = (extra?: string): React.SVGProps<SVGSVGElement> => ({
  viewBox: "0 0 64 64",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: extra,
});

export function CompassIcon({ size = 48, className, ...rest }: IconProps) {
  return (
    <svg {...base()} width={size} height={size} className={cn(className)} {...rest}>
      <circle cx="32" cy="14" r="3" />
      <path d="M32 17 L20 50" />
      <path d="M32 17 L44 50" />
      <path d="M14 54 H50" />
      <path d="M38 38 L46 30" />
      <path d="M44 28 L48 32" />
    </svg>
  );
}

export function GearIcon({ size = 48, className, ...rest }: IconProps) {
  return (
    <svg {...base()} width={size} height={size} className={cn(className)} {...rest}>
      <path d="M32 8 L36 8 L37 13 A20 20 0 0 1 43 16 L48 13 L51 16 L48 21 A20 20 0 0 1 51 27 L56 28 L56 32 L51 33 A20 20 0 0 1 48 39 L51 44 L48 47 L43 44 A20 20 0 0 1 37 47 L36 52 L28 52 L27 47 A20 20 0 0 1 21 44 L16 47 L13 44 L16 39 A20 20 0 0 1 13 33 L8 32 L8 28 L13 27 A20 20 0 0 1 16 21 L13 16 L16 13 L21 16 A20 20 0 0 1 27 13 L28 8 Z" />
      <circle cx="32" cy="30" r="7" />
      <path d="M10 58 H54" />
      <path d="M14 58 V54" />
      <path d="M22 58 V54" />
      <path d="M30 58 V54" />
      <path d="M38 58 V54" />
      <path d="M46 58 V54" />
    </svg>
  );
}

export function ShovelIcon({ size = 48, className, ...rest }: IconProps) {
  return (
    <svg {...base()} width={size} height={size} className={cn(className)} {...rest}>
      <path d="M48 6 L26 28" />
      <path d="M22 24 L40 42 A12 12 0 0 1 22 42 A12 12 0 0 1 22 24 Z" />
      <path d="M44 4 H52 V12" />
    </svg>
  );
}

export function ExcavatorIcon({ size = 48, className, ...rest }: IconProps) {
  return (
    <svg {...base()} width={size} height={size} className={cn(className)} {...rest}>
      <path d="M10 40 H42 V48 H10 Z" />
      <circle cx="16" cy="52" r="4" />
      <circle cx="24" cy="52" r="4" />
      <circle cx="32" cy="52" r="4" />
      <circle cx="38" cy="52" r="4" />
      <path d="M18 40 V30 H32 V40" />
      <path d="M32 32 L48 18" />
      <path d="M48 18 L56 26 L50 32 L42 30 Z" />
      <path d="M6 58 H58" />
    </svg>
  );
}

export function JackhammerIcon({ size = 48, className, ...rest }: IconProps) {
  return (
    <svg {...base()} width={size} height={size} className={cn(className)} {...rest}>
      <path d="M24 8 H40 V20 H24 Z" />
      <path d="M18 14 H24" />
      <path d="M40 14 H46" />
      <path d="M32 20 V40" />
      <path d="M28 40 H36 V46 H28 Z" />
      <path d="M30 46 L26 56" />
      <path d="M34 46 L38 56" />
      <path d="M8 58 H56" />
      <path d="M14 54 L18 50" />
      <path d="M50 54 L46 50" />
    </svg>
  );
}

export function CraneIcon({ size = 48, className, ...rest }: IconProps) {
  return (
    <svg {...base()} width={size} height={size} className={cn(className)} {...rest}>
      <path d="M14 6 V52" />
      <path d="M10 52 H22" />
      <path d="M14 10 L58 10" />
      <path d="M14 18 L52 10" />
      <path d="M40 10 V18" />
      <path d="M40 18 H46 V24 H40 Z" />
      <path d="M28 10 V14" />
      <path d="M28 14 L24 18 L32 18 Z" />
      <path d="M28 18 V24" />
      <path d="M22 52 H58 V58 H22 Z" />
      <path d="M30 52 V46 H38 V52" />
    </svg>
  );
}

export function BlueprintIcon({ size = 48, className, ...rest }: IconProps) {
  return (
    <svg {...base()} width={size} height={size} className={cn(className)} {...rest}>
      <path d="M10 12 H44 V52 H10 Z" />
      <path d="M44 12 C50 12 54 16 54 22 V52 H44" />
      <path d="M16 20 H36" />
      <path d="M16 28 H30" />
      <path d="M16 36 H38" />
      <path d="M16 44 H26" />
    </svg>
  );
}

export function ToolsIcon({ size = 48, className, ...rest }: IconProps) {
  return (
    <svg {...base()} width={size} height={size} className={cn(className)} {...rest}>
      {/* Wrench */}
      <path d="M44 8 A8 8 0 0 0 36 20 L12 44 A6 6 0 0 0 20 52 L44 28 A8 8 0 0 0 56 20 L50 26 L46 22 L52 16 Z" />
      {/* Screwdriver crossed */}
      <path d="M8 24 L24 40" />
      <path d="M22 38 L34 50" />
      <path d="M30 46 L40 56" />
      <path d="M40 56 L44 52" />
    </svg>
  );
}

export function BarrierIcon({ size = 48, className, ...rest }: IconProps) {
  return (
    <svg {...base()} width={size} height={size} className={cn(className)} {...rest}>
      <path d="M10 18 H54 V28 H10 Z" />
      <path d="M14 18 V12" />
      <path d="M50 18 V12" />
      <circle cx="32" cy="14" r="3" />
      <path d="M14 22 L24 28" />
      <path d="M28 22 L38 28" />
      <path d="M42 22 L52 28" />
      <path d="M10 38 H54 V48 H10 Z" />
      <path d="M14 42 L24 48" />
      <path d="M28 42 L38 48" />
      <path d="M42 42 L52 48" />
      <path d="M14 48 V56" />
      <path d="M50 48 V56" />
    </svg>
  );
}

export function WheelbarrowIcon({ size = 48, className, ...rest }: IconProps) {
  return (
    <svg {...base()} width={size} height={size} className={cn(className)} {...rest}>
      <path d="M18 22 C26 14 42 14 50 22 L46 38 H22 Z" />
      <path d="M22 38 L12 50" />
      <path d="M46 38 L56 50" />
      <circle cx="22" cy="50" r="5" />
      <path d="M8 56 H58" />
    </svg>
  );
}

export function ConeIcon({ size = 48, className, ...rest }: IconProps) {
  return (
    <svg {...base()} width={size} height={size} className={cn(className)} {...rest}>
      <path d="M30 10 L20 46 H44 L34 10 Z" />
      <path d="M22 22 H42" />
      <path d="M21 32 H43" />
      <path d="M10 50 H54 V56 H10 Z" />
    </svg>
  );
}

export function RoadIcon({ size = 48, className, ...rest }: IconProps) {
  return (
    <svg {...base()} width={size} height={size} className={cn(className)} {...rest}>
      <path d="M8 14 H40 C48 14 50 22 50 30 V50 H38" />
      <path d="M8 22 H30 C36 22 38 28 38 34 V50" />
      <path d="M14 18 H22" />
      <path d="M28 18 H36" />
      <path d="M14 28 H22" />
      <path d="M22 36 H30" />
      <path d="M40 44 V50" />
    </svg>
  );
}

export function DrillIcon({ size = 48, className, ...rest }: IconProps) {
  return (
    <svg {...base()} width={size} height={size} className={cn(className)} {...rest}>
      <path d="M14 18 H38 V32 H14 Z" />
      <path d="M38 22 H46 V28 H38 Z" />
      <path d="M46 25 L58 25" />
      <path d="M22 32 V40 H30 V32" />
      <path d="M8 58 H56" />
      <path d="M18 52 L22 46" />
      <path d="M30 50 L34 44" />
      <path d="M42 56 L46 50" />
    </svg>
  );
}

/* ---------- Tile wrapper — SubBase-style colored card with line icon ---------- */

type TileTone = "brand" | "dark" | "light" | "muted" | "outline";

const tones: Record<TileTone, { bg: string; fg: string; border?: string }> = {
  brand:   { bg: "bg-brand",        fg: "text-brand-foreground" },
  dark:    { bg: "bg-foreground",   fg: "text-background" },
  light:   { bg: "bg-card",         fg: "text-brand", border: "border border-border" },
  muted:   { bg: "bg-muted",        fg: "text-foreground/70" },
  outline: { bg: "bg-transparent",  fg: "text-brand", border: "border-2 border-brand" },
};

export function IconTile({
  icon: Icon,
  tone = "brand",
  size = "md",
  className,
  iconSize,
  ...rest
}: {
  icon: React.ComponentType<IconProps>;
  tone?: TileTone;
  size?: "sm" | "md" | "lg" | "xl";
  iconSize?: number;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const sizes = {
    sm: { box: "h-12 w-12 rounded-md", icon: 24 },
    md: { box: "h-16 w-16 rounded-lg", icon: 32 },
    lg: { box: "h-24 w-24 rounded-xl", icon: 48 },
    xl: { box: "h-32 w-32 rounded-2xl", icon: 64 },
  } as const;
  const s = sizes[size];
  const t = tones[tone];
  return (
    <div
      className={cn(
        "flex items-center justify-center shrink-0",
        s.box,
        t.bg,
        t.fg,
        t.border,
        className,
      )}
      {...rest}
    >
      <Icon size={iconSize ?? s.icon} strokeWidth={1.75} />
    </div>
  );
}

export const ConstructionIcons = {
  Compass: CompassIcon,
  Gear: GearIcon,
  Shovel: ShovelIcon,
  Excavator: ExcavatorIcon,
  Jackhammer: JackhammerIcon,
  Crane: CraneIcon,
  Blueprint: BlueprintIcon,
  Tools: ToolsIcon,
  Barrier: BarrierIcon,
  Wheelbarrow: WheelbarrowIcon,
  Cone: ConeIcon,
  Road: RoadIcon,
  Drill: DrillIcon,
};
