import type { Metadata } from "next";
import Link from "next/link";

import { NewIssuePanel } from "@/components/issues/new-issue-panel";
import { isAIConfigured } from "@/lib/ai/provider";
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
        <p className="text-sm text-muted-foreground">
          It will be added to your workspace and given the next key in the
          project.
        </p>
      </header>

      {options.projects.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            You need a project first.{" "}
            <Link href="/projects" className="text-accent hover:underline">
              Go to projects
            </Link>
            .
          </p>
        </Card>
      ) : (
        <Card>
          {/*
            isAIConfigured() runs on the SERVER and only a boolean crosses to the
            client. The key itself never leaves the server -- which is the whole
            reason ANTHROPIC_API_KEY has no NEXT_PUBLIC_ prefix.
          */}
          <NewIssuePanel
            aiConfigured={isAIConfigured()}
            projects={options.projects}
            labels={options.labels}
            members={options.members}
          />
        </Card>
      )}
    </div>
  );
}
