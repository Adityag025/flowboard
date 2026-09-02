"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signInAction, type AuthFormState } from "@/lib/actions/auth";

import { SubmitButton } from "./submit-button";

/**
 * A Client Component, but note what it is NOT doing: no fetch, no manual
 * loading flag, no error state of its own. useActionState wires the form
 * straight to a server action and gives back the returned state.
 *
 * The form also works with JavaScript disabled -- React renders a real <form>
 * with a real action, so the browser submits it natively and the server action
 * still runs. That is progressive enhancement for free.
 */
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    signInAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      <Field id="email" label="Email" errors={state?.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state?.fieldErrors?.email)}
          aria-describedby={state?.fieldErrors?.email ? "email-error" : undefined}
        />
      </Field>

      <Field id="password" label="Password" errors={state?.fieldErrors?.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state?.fieldErrors?.password)}
        />
      </Field>

      {state?.formError && (
        <p role="alert" className="text-sm text-red-500">
          {state.formError}
        </p>
      )}

      <SubmitButton>Sign in</SubmitButton>

      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Create one
        </Link>
      </p>
    </form>
  );
}
