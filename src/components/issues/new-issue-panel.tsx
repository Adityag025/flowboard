"use client";

import { useState } from "react";

import { DraftPanel } from "@/components/ai/draft-panel";
import { CreateIssueForm } from "@/components/issues/create-issue-form";
import type { IssueDraft } from "@/lib/actions/ai";

/**
 * Owns the handoff between the AI panel and the form.
 *
 * `draftVersion` is used as a React `key` on the form. The form's inputs are
 * uncontrolled (they use defaultValue), and React only reads defaultValue on
 * mount -- so changing the prop alone would do nothing visible. Bumping the key
 * remounts the form, which is what makes a second "Draft" actually replace the
 * first one's values.
 *
 * The alternative -- making every input controlled -- means re-rendering the
 * whole form on every keystroke to solve a problem that occurs twice per page.
 */
export function NewIssuePanel({
  aiConfigured,
  projects,
  labels,
  members,
}: {
  aiConfigured: boolean;
  projects: Array<{ id: string; name: string; key: string }>;
  labels: Array<{ id: string; name: string; color: string }>;
  members: Array<{ id: string; name: string }>;
}) {
  const [draft, setDraft] = useState<IssueDraft | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);

  return (
    <div className="space-y-5">
      <DraftPanel
        aiConfigured={aiConfigured}
        onDraft={(next) => {
          setDraft(next);
          setDraftVersion((version) => version + 1);
        }}
      />

      <CreateIssueForm
        key={draftVersion}
        projects={projects}
        labels={labels}
        members={members}
        draft={draft}
      />
    </div>
  );
}
