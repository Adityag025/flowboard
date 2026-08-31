import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects",
};

// Placeholder. Real implementation lands in a later stage -- this exists so the
// sidebar links resolve instead of 404-ing while we build the shell.
export default function ProjectsPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
      <p className="text-sm text-muted">Project list and creation arrive in Stage 4, once the database exists.</p>
    </div>
  );
}
