"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signUpAction, type AuthFormState } from "@/lib/actions/auth";

import { SubmitButton } from "./submit-button";

export function SignupForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    signUpAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field id="name" label="Name" errors={state?.fieldErrors?.name}>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          aria-invalid={Boolean(state?.fieldErrors?.name)}
        />
      </Field>

      <Field id="email" label="Email" errors={state?.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state?.fieldErrors?.email)}
        />
      </Field>

      <Field
        id="password"
        label="Password"
        errors={state?.fieldErrors?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          // "new-password" tells password managers to OFFER TO GENERATE one,
          // where "current-password" would make them autofill the wrong value.
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={Boolean(state?.fieldErrors?.password)}
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </Field>

      {state?.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}

      <SubmitButton>Create account</SubmitButton>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
