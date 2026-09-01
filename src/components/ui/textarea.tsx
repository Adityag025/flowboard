import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm outline-none transition-colors",
        "placeholder:text-muted focus:border-accent aria-invalid:border-red-500",
        className,
      )}
      {...props}
    />
  );
}
