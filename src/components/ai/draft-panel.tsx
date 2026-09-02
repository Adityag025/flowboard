"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { draftIssueAction, type IssueDraft } from "@/lib/actions/ai";

/**
 * "Describe the problem, get a filled-in form."
 *
 * A Server Action, not a stream: the form needs the WHOLE object before it can
 * populate anything. Half a title is not useful, so there is nothing to gain
 * from streaming and we keep end-to-end type safety instead.
 */
export function DraftPanel({
  aiConfigured,
  onDraft,
}: {
  aiConfigured: boolean;
  onDraft: (draft: IssueDraft) => void;
}) {
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!aiConfigured) return null;

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await draftIssueAction({ description });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDraft(result.draft);
    });
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-3">
      <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="size-3.5" aria-hidden="true" />
        Draft with AI
      </h2>

      <Textarea
        rows={3}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Users are getting logged out whenever they refresh the dashboard."
        maxLength={4000}
        className="text-sm"
      />

      {error && (
        <p role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground opacity-70">
          Fills in the form below. Review before saving.
        </p>
        <Button
          variant="outline"
          onClick={generate}
          disabled={isPending || description.trim().length < 10}
          className="h-7 shrink-0 px-2 text-xs"
        >
          {isPending ? "Drafting..." : "Draft"}
        </Button>
      </div>
    </div>
  );
}
