import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50",
  secondary:
    "border border-border bg-surface hover:bg-surface-hover disabled:opacity-50",
  ghost: "text-muted hover:bg-surface-hover hover:text-foreground",
} as const;

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ComponentProps<"button"> & { variant?: keyof typeof variants }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed",

        /**
         * PRESS FEEDBACK, via the `.press` class in globals.css.
         *
         * A button with no :active state does not feel like it heard you -- the
         * click registers, but nothing confirms it, and on a slow action the
         * user clicks again.
         *
         * Not `active:scale-[0.97]`: that Tailwind utility put the class on the
         * element and generated no CSS rule for it, so the effect was silently
         * inert. `.press` is plain CSS with named transition properties -- never
         * `transition: all`, which would animate layout properties too.
         */
        "press",

        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
