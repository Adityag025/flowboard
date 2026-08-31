import { cn } from "@/lib/utils";

/**
 * Variants are a lookup table, not conditional logic. Adding a status later
 * means adding a row here -- no branching to untangle at each call site.
 */
const variants = {
  neutral: "bg-surface-hover text-muted",
  backlog: "bg-surface-hover text-muted",
  todo: "bg-slate-500/10 text-slate-500",
  "in-progress": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  done: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  low: "bg-slate-500/10 text-slate-500",
  medium: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  high: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  urgent: "bg-red-500/10 text-red-600 dark:text-red-400",
} as const;

export type BadgeVariant = keyof typeof variants;

export function Badge({
  variant = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
