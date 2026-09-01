import { cn } from "@/lib/utils";

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-border bg-canvas px-2.5 text-sm outline-none transition-colors",
        "focus:border-accent disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
