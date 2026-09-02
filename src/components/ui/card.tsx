import { cn } from "@/lib/utils";

/**
 * A bordered block, not a floating card.
 *
 * Kept as `Card` because a dozen call sites use it, but the styling is now a
 * hairline box on the same background as the page -- no fill difference, no
 * shadow, no radius. The border is the only thing saying "this content belongs
 * together", which is what stops the interface reading as a grid of tiles.
 */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("border border-border bg-surface p-4", className)}
      {...props}
    />
  );
}

/**
 * A section with a tracked uppercase label and a rule running to the edge.
 *
 * This is the primary structural device -- the reason most of the app needs no
 * boxes at all. Prefer it over Card wherever the content is a list or a set of
 * values rather than a discrete object.
 */
export function Section({
  label,
  meta,
  children,
  className,
}: {
  label: string;
  /** Optional right-aligned detail: a count, a range, a link. */
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center gap-3">
        <h2 className="rule-label flex-1">{label}</h2>
        {meta && <span className="shrink-0 text-[10px] text-muted-foreground">{meta}</span>}
      </div>
      {children}
    </section>
  );
}
