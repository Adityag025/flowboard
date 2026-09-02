"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { SettingsFormState } from "@/lib/actions/settings";

/**
 * A field described as DATA, not as JSX.
 *
 * This shape exists because of a hard RSC rule I got wrong first: the first
 * version took `children` as a render function `(state) => ReactNode` so the
 * server page could lay out its own inputs. React rejected it outright --
 *
 *   "Functions are not valid as a child of Client Components"
 *
 * -- because a function cannot be serialized across the server/client boundary.
 * Only DATA crosses. So the server describes its fields and this component,
 * which owns the form state, renders them.
 *
 * Same family as the two earlier boundary lessons in this codebase: a Client
 * Component may receive data and already-rendered children, never a callback to
 * invoke later.
 */
export type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "password";
  defaultValue?: string;
  autoComplete?: string;
  hint?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  disabled?: boolean;
  /** Distinguishes ids when the same field name appears in two forms on a page. */
  idPrefix?: string;
};

export function SettingsForm({
  action,
  submitLabel,
  fields,
  hiddenFields,
}: {
  action: (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;
  submitLabel: string;
  fields: FieldSpec[];
  hiddenFields?: Record<string, string>;
}) {
  const [state, formAction] = useActionState<SettingsFormState, FormData>(action, null);

  return (
    <form action={formAction} className="space-y-4">
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

      {fields.map((field) => {
        const id = `${field.idPrefix ?? ""}${field.name}`;
        const errors = state?.fieldErrors?.[field.name];

        return (
          <Field key={id} id={id} label={field.label} errors={errors}>
            <Input
              id={id}
              name={field.disabled ? undefined : field.name}
              type={field.type ?? "text"}
              defaultValue={field.defaultValue}
              autoComplete={field.autoComplete}
              required={field.required}
              minLength={field.minLength}
              maxLength={field.maxLength}
              disabled={field.disabled}
              readOnly={field.disabled}
              aria-invalid={Boolean(errors)}
            />
            {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
          </Field>
        );
      })}

      {state?.formError && (
        <p role="alert" className="text-sm text-red-500">
          {state.formError}
        </p>
      )}

      {state?.ok && state.message && (
        // aria-live, not role="alert": success is informational, and an alert
        // interrupts whatever a screen reader is currently reading.
        // Amber, not emerald: this design has exactly one signal colour, so a
        // second hue for "success" would dilute what colour means here -- and
        // the emerald pair depended on a `dark:` variant that shadcn's init had
        // just made inert anyway.
        <p aria-live="polite" className="text-sm text-accent">
          {state.message}
        </p>
      )}

      <div className="flex justify-end">
        <div className="w-36">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
      </div>
    </form>
  );
}
