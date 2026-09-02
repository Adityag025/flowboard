"use client";

import Link from "next/link";
import { useActionState } from "react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";
import type { IssueDraft } from "@/lib/actions/ai";
import { createIssueAction, type IssueFormState } from "@/lib/actions/issues";
import { priorityLabels, statusLabels } from "@/lib/issues";

type Option = { id: string; name: string };

export function CreateIssueForm({
  projects,
  labels,
  members,
  draft = null,
}: {
  projects: Array<{ id: string; name: string; key: string }>;
  labels: Array<{ id: string; name: string; color: string }>;
  members: Option[];
  /**
   * Optional AI-generated starting values. Every field stays editable -- the
   * draft is a starting point the user reviews, never a submission. The form is
   * remounted by its parent when a new draft arrives; see NewIssuePanel.
   */
  draft?: IssueDraft | null;
}) {
  const draftLabelIds = new Set(draft?.labelIds ?? []);
  const [state, formAction] = useActionState<IssueFormState, FormData>(
    createIssueAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-5">
      <Field id="title" label="Title" errors={state?.fieldErrors?.title}>
        <Input
          id="title"
          name="title"
          required
          maxLength={200}
          autoFocus
          defaultValue={draft?.title ?? ""}
          placeholder="Something short and specific"
          aria-invalid={Boolean(state?.fieldErrors?.title)}
        />
      </Field>

      <Field
        id="description"
        label="Description"
        errors={state?.fieldErrors?.description}
      >
        <Textarea
          id="description"
          name="description"
          rows={5}
          defaultValue={draft?.description ?? ""}
          placeholder="What is happening, and what should happen instead?"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="projectId" label="Project" errors={state?.fieldErrors?.projectId}>
          <Select id="projectId" name="projectId" required defaultValue={projects[0]?.id ?? ""}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} ({project.key})
              </option>
            ))}
          </Select>
        </Field>

        <Field id="assigneeId" label="Assignee" errors={state?.fieldErrors?.assigneeId}>
          <Select id="assigneeId" name="assigneeId" defaultValue="">
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="status" label="Status" errors={state?.fieldErrors?.status}>
          <Select id="status" name="status" defaultValue={IssueStatus.BACKLOG}>
            {Object.values(IssueStatus).map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="priority" label="Priority" errors={state?.fieldErrors?.priority}>
          <Select
            id="priority"
            name="priority"
            defaultValue={draft?.priority ?? IssuePriority.NONE}
          >
            {Object.values(IssuePriority).map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabels[priority]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {labels.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Labels</legend>
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => (
              // Every checkbox shares the name "labelIds"; the action reads
              // them with formData.getAll().
              <label
                key={label.id}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-surface-hover has-checked:border-accent has-checked:bg-accent-subtle"
              >
                <input
                  type="checkbox"
                  name="labelIds"
                  value={label.id}
                  defaultChecked={draftLabelIds.has(label.id)}
                  className="size-3.5 accent-accent"
                />
                <span style={{ color: label.color }}>{label.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {state?.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton>Create issue</SubmitButton>
        <Link
          href="/issues"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
