"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * A submit button that disables itself while the form is in flight.
 *
 * useFormStatus reads the pending state of the NEAREST ENCLOSING <form>, which
 * is why this has to be its own component -- a hook cannot observe a form it is
 * rendered inside of from that same form's component. It must be a child.
 *
 * Without this, a double-click submits twice and creates two accounts.
 */
export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Please wait..." : children}
    </Button>
  );
}
