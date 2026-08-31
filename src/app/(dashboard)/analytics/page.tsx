import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analytics",
};

// Placeholder. Real implementation lands in a later stage -- this exists so the
// sidebar links resolve instead of 404-ing while we build the shell.
export default function AnalyticsPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <p className="text-sm text-muted">Charts and reports arrive in Stage 8.</p>
    </div>
  );
}
