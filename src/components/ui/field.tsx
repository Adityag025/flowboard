import { cn } from "@/lib/utils";

/**
 * A labelled form field with its error message.
 *
 * `htmlFor`/`id` pairing is not decoration: without it, clicking the label
 * does not focus the input and screen readers announce the field as unlabelled.
 * `aria-describedby` ties the error text to the input for the same reason.
 */
export function Field({
  id,
  label,
  errors,
  children,
}: {
  id: string;
  label: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  const errorId = `${id}-error`;
  const hasErrors = Boolean(errors?.length);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hasErrors && (
        <p id={errorId} className={cn("text-xs text-destructive")}>
          {errors!.join(". ")}
        </p>
      )}
    </div>
  );
}
