import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none transition-colors",
        "placeholder:text-muted-foreground focus:border-accent",
        // aria-invalid is set by the form when the server rejects a field, so
        // the error styling is driven by the same attribute screen readers use
        // rather than a second, parallel prop that could drift out of sync.
        "aria-invalid:border-red-500",
        className,
      )}
      {...props}
    />
  );
}
