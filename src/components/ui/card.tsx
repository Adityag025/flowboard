import { cn } from "@/lib/utils";

/**
 * No "use client" -- Card renders on the server and ships zero JS.
 * A component only needs the client bundle if it uses state, effects, or
 * browser events. Presentation does not.
 */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-5",
        className,
      )}
      {...props}
    />
  );
}
