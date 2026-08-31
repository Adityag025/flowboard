import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Issues",
};

// Placeholder. Real implementation lands in Stage 5 -- this exists so the
// sidebar links resolve instead of 404-ing while we build the shell.
export default function IssuesPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Issues</h1>
      <p className="text-sm text-muted">
        Issue list, filtering and the Kanban board arrive in Stages 5 and 6.
      </p>
    </div>
  );
}
