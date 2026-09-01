"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Filters in ONE ROW above the charts, per the dataviz interaction spec -- not
 * scattered beside the panel each one affects.
 *
 * State lives in the URL for the same reasons as the issue list: the view is
 * shareable, the back button works, and the SERVER re-aggregates rather than the
 * browser filtering data it should never have received.
 */
export function AnalyticsFilters({
  projects,
}: {
  projects: Array<{ key: string; name: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => router.push(`/analytics?${params.toString()}`));
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 transition-opacity",
        isPending && "opacity-60",
      )}
    >
      <Select
        className="w-auto"
        aria-label="Filter by project"
        value={searchParams.get("projectKey") ?? ""}
        onChange={(event) => setParam("projectKey", event.target.value)}
      >
        <option value="">All projects</option>
        {projects.map((project) => (
          <option key={project.key} value={project.key}>
            {project.name}
          </option>
        ))}
      </Select>

      <Select
        className="w-auto"
        aria-label="Throughput time range"
        value={searchParams.get("weeks") ?? "8"}
        onChange={(event) => setParam("weeks", event.target.value)}
      >
        <option value="4">Last 4 weeks</option>
        <option value="8">Last 8 weeks</option>
        <option value="12">Last 12 weeks</option>
        <option value="26">Last 26 weeks</option>
      </Select>
    </div>
  );
}
