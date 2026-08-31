import Link from "next/link";

/**
 * A SECOND route group, sitting beside (dashboard).
 *
 * This is what route groups are for. /login and /dashboard are both top-level
 * URLs, but they need completely different chrome -- no sidebar or header here,
 * just a centred card. Without groups we would need a conditional inside one
 * shared layout, checking the pathname to decide what to render. That gets
 * unreadable fast and forces the layout to become a Client Component.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded bg-accent text-sm font-bold text-accent-foreground">
          F
        </span>
        <span className="text-base font-semibold tracking-tight">FlowBoard</span>
      </Link>

      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        {children}
      </div>
    </div>
  );
}
