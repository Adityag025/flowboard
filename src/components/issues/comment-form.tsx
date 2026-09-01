"use client";

import { useActionState, useEffect, useRef } from "react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { addCommentAction, type IssueFormState } from "@/lib/actions/issues";

export function CommentForm({ issueId }: { issueId: string }) {
  const [state, formAction] = useActionState<IssueFormState, FormData>(
    addCommentAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  /**
   * Clear the textarea after a successful post.
   *
   * The action returns null on success and an object on failure, so a null
   * state after a submission means it worked. Without this the comment appears
   * in the thread while still sitting in the box, and it is easy to post twice.
   */
  useEffect(() => {
    if (state === null) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="issueId" value={issueId} />
      <Textarea
        name="body"
        rows={3}
        required
        placeholder="Leave a comment..."
        aria-invalid={Boolean(state?.fieldErrors?.body)}
      />
      {state?.fieldErrors?.body && (
        <p className="text-xs text-red-500">{state.fieldErrors.body.join(". ")}</p>
      )}
      {state?.formError && (
        <p role="alert" className="text-sm text-red-500">
          {state.formError}
        </p>
      )}
      <div className="flex justify-end">
        <div className="w-32">
          <SubmitButton>Comment</SubmitButton>
        </div>
      </div>
    </form>
  );
}
