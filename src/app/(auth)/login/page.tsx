import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * In Next 16 `searchParams` is a PROMISE and must be awaited. It used to be a
 * plain object; awaiting it is what lets the rest of the page start rendering
 * before the query string is needed.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted">Sign in to continue to FlowBoard.</p>
      </div>

      <LoginForm next={next} />
    </div>
  );
}
