"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createProjectAction, type ProjectFormState } from "@/lib/actions/projects";
import { suggestProjectKey } from "@/lib/validations/projects";

export function CreateProjectForm({
  workspaces,
}: {
  workspaces: Array<{ id: string; name: string }>;
}) {
  const [state, formAction] = useActionState<ProjectFormState, FormData>(
    createProjectAction,
    null,
  );

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  /**
   * Once the user edits the key themselves, stop overwriting it.
   *
   * Without this flag, typing the name after touching the key silently replaces
   * their choice -- the interface fighting the user, which is worse than no
   * suggestion at all.
   */
  const [keyEdited, setKeyEdited] = useState(false);

  const suggested = suggestProjectKey(name);
  const keyValue = keyEdited ? key : suggested;

  return (
    <form action={formAction} className="space-y-5">
      {workspaces.length > 1 ? (
        <Field id="workspaceId" label="Workspace" errors={state?.fieldErrors?.workspaceId}>
          <Select id="workspaceId" name="workspaceId" required defaultValue={workspaces[0]?.id}>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        // A select with one option is a decision the user does not have.
        <input type="hidden" name="workspaceId" value={workspaces[0]?.id ?? ""} />
      )}

      <Field id="name" label="Project name" errors={state?.fieldErrors?.name}>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={80}
          autoFocus
          placeholder="Mobile App"
          aria-invalid={Boolean(state?.fieldErrors?.name)}
        />
      </Field>

      <Field id="key" label="Issue key prefix" errors={state?.fieldErrors?.key}>
        <Input
          id="key"
          name="key"
          value={keyValue}
          onChange={(event) => {
            setKeyEdited(true);
            // Uppercased as you type, so the field shows exactly what the server
            // will store rather than silently transforming it on submit.
            setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8));
          }}
          required
          maxLength={8}
          className="font-mono"
          placeholder="MA"
          aria-invalid={Boolean(state?.fieldErrors?.key)}
        />
        <p className="text-xs text-muted">
          Issues will be numbered{" "}
          <span className="font-mono">{keyValue || "KEY"}-1</span>,{" "}
          <span className="font-mono">{keyValue || "KEY"}-2</span>, and so on. This
          appears in every issue reference, so it is worth getting right — it
          can&apos;t be changed later.
        </p>
      </Field>

      <Field id="description" label="Description" errors={state?.fieldErrors?.description}>
        <Textarea
          id="description"
          name="description"
          rows={3}
          maxLength={500}
          placeholder="What this project covers. Optional."
        />
      </Field>

      {state?.formError && (
        <p role="alert" className="text-sm text-red-500">
          {state.formError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton>Create project</SubmitButton>
        <Link
          href="/projects"
          className="text-sm text-muted transition-colors hover:text-foreground"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
