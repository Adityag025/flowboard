import { describe, expect, it } from "vitest";

import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";

import {
  BOARD_COLUMNS,
  OPEN_STATUSES,
  issueKey,
  priorityLabels,
  priorityVariants,
  statusLabels,
  statusVariants,
} from "./issues";

/**
 * The `satisfies Record<IssueStatus, ...>` in issues.ts already catches a
 * missing entry at COMPILE time. These tests catch the other direction and the
 * cases types cannot see: an entry that exists but is empty, a column list that
 * drifts from the enum, and OPEN_STATUSES quietly including DONE.
 */
describe("enum coverage", () => {
  it("every status has a non-empty label and a variant", () => {
    for (const status of Object.values(IssueStatus)) {
      expect(statusLabels[status], status).toBeTruthy();
      expect(statusVariants[status], status).toBeTruthy();
    }
  });

  it("every priority has a non-empty label and a variant", () => {
    for (const priority of Object.values(IssuePriority)) {
      expect(priorityLabels[priority], priority).toBeTruthy();
      expect(priorityVariants[priority], priority).toBeTruthy();
    }
  });

  it("no label is left as the raw enum value", () => {
    // "IN_PROGRESS" leaking to the UI is the exact bug the mapping exists to
    // prevent, so assert no label is just the SCREAMING_SNAKE key.
    for (const status of Object.values(IssueStatus)) {
      expect(statusLabels[status]).not.toBe(status);
    }
  });
});

describe("BOARD_COLUMNS", () => {
  it("covers every status exactly once", () => {
    expect([...BOARD_COLUMNS].sort()).toEqual(Object.values(IssueStatus).sort());
  });

  it("puts Backlog first and Done before Canceled", () => {
    expect(BOARD_COLUMNS[0]).toBe(IssueStatus.BACKLOG);
    expect(BOARD_COLUMNS.indexOf(IssueStatus.DONE)).toBeLessThan(
      BOARD_COLUMNS.indexOf(IssueStatus.CANCELED),
    );
  });
});

describe("OPEN_STATUSES", () => {
  it("excludes DONE and CANCELED", () => {
    expect(OPEN_STATUSES).not.toContain(IssueStatus.DONE);
    expect(OPEN_STATUSES).not.toContain(IssueStatus.CANCELED);
  });

  it("includes every other status", () => {
    const closed: string[] = [IssueStatus.DONE, IssueStatus.CANCELED];
    const expected = Object.values(IssueStatus).filter((s) => !closed.includes(s));
    expect([...OPEN_STATUSES].sort()).toEqual(expected.sort());
  });
});

describe("issueKey", () => {
  it("joins project key and number", () => {
    expect(issueKey("FLOW", 124)).toBe("FLOW-124");
  });

  it("round-trips through parseIssueKey", async () => {
    const { parseIssueKey } = await import("./validations/issues");
    expect(parseIssueKey(issueKey("FLOW", 124))).toEqual({
      projectKey: "FLOW",
      number: 124,
    });
  });
});
