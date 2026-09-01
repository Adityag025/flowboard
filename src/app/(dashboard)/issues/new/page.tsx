import type { Metadata } from "next";
import Link from "next/link";

import { CreateIssueForm } from "@/components/issues/create-issue-form";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { getFormOptions } from "@/lib/queries/issues";

export const metadata: Metadata = {
  title: "New issue",
};

export default async function NewIssuePage() {
  const user = await requireUser();
  const options = await getFormOptions(user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New issue</h1>
        <p className="text-sm text-muted">
          It will be added to your workspace and given the next key in the
          project.
        </p>
      </header>

      {options.projects.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            You need a project first.{" "}
            <Link href="/projects" className="text-accent hover:underline">
              Go to projects
            </Link>
            .
          </p>
        </Card>
      ) : (
        <Card>
          <CreateIssueForm
            projects={options.projects}
            labels={options.labels}
            members={options.members}
          />
        </Card>
      )}
    </div>
  );
}
