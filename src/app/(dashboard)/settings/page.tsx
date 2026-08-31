import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
};

// Placeholder. Real implementation lands in a later stage -- this exists so the
// sidebar links resolve instead of 404-ing while we build the shell.
export default function SettingsPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="text-sm text-muted">Profile and workspace settings arrive in Stage 3, alongside authentication.</p>
    </div>
  );
}
