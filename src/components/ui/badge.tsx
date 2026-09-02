import { cn } from "@/lib/utils";

/**
 * A status marker: GLYPH + UPPERCASE TEXT, not a coloured pill.
 *
 * Two reasons this is not a filled chip:
 *
 *   1. With one signal colour in the system, five differently-tinted pills would
 *      have to reintroduce a palette that means nothing -- colour would decorate
 *      rather than inform.
 *   2. The glyph carries the state, so meaning never rests on colour alone. That
 *      is an accessibility requirement satisfied by the design rather than
 *      bolted on afterwards.
 *
 * The glyphs are chosen to read as a progression at a glance:
 *   ○ empty (not started) → ◐ partial (in progress) → ● full (done) → ✕ dropped
 *   and ▲ for urgency, which points upward like a raised hand.
 */
const variants = {
  neutral: "text-muted-foreground",
  slate: "text-muted-foreground",
  amber: "text-accent",
  emerald: "text-foreground",
  sky: "text-muted-foreground",
  orange: "text-accent",
  red: "text-accent",
} as const;

export type BadgeVariant = keyof typeof variants;

export function Badge({
  variant = "neutral",
  glyph,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & {
  variant?: BadgeVariant;
  /** Prefix glyph. Omitted for label chips, which are names not states. */
  glyph?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-[10px] uppercase tracking-wider",
        variants[variant],
        className,
      )}
      {...props}
    >
      {glyph && (
        // Fixed width so a row of badges stays on a grid regardless of glyph.
        <span aria-hidden="true" className="inline-block w-2 text-center">
          {glyph}
        </span>
      )}
      {children}
    </span>
  );
}
