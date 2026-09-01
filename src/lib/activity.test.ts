import { describe, expect, it } from "vitest";

import { ActivityType } from "@/generated/prisma/enums";

import { describeActivity, relativeTime } from "./activity";

const actor = { name: "Aditya Gupta" };

/**
 * `metadata` is a Json column, so Postgres cannot guarantee its shape. This is
 * the file that has to prove the schema comment true: an unrecognised shape must
 * degrade to a vaguer sentence, never throw. A crash here would take down the
 * whole issue page over a display string.
 */
describe("describeActivity", () => {
  it("describes a status change with both ends", () => {
    expect(
      describeActivity({
        type: ActivityType.ISSUE_STATUS_CHANGED,
        metadata: { from: "TODO", to: "IN_PROGRESS" },
        actor,
      }),
    ).toBe("Aditya Gupta changed status from Todo to In Progress");
  });

  it("falls back when a status value is not a known enum member", () => {
    const text = describeActivity({
      type: ActivityType.ISSUE_STATUS_CHANGED,
      metadata: { from: "WAT", to: "ALSO_WAT" },
      actor,
    });
    expect(text).toBe("Aditya Gupta changed the status");
  });

  it("names the actor as Someone when attribution was lost", () => {
    // A deleted user SET NULLs the actor, by design -- their activity survives.
    expect(
      describeActivity({
        type: ActivityType.ISSUE_CREATED,
        metadata: null,
        actor: null,
      }),
    ).toBe("Someone created this issue");
  });

  it("distinguishes assigning from unassigning", () => {
    expect(
      describeActivity({
        type: ActivityType.ISSUE_ASSIGNED,
        metadata: { assigneeId: "abc" },
        actor,
      }),
    ).toContain("changed the assignee");

    expect(
      describeActivity({
        type: ActivityType.ISSUE_ASSIGNED,
        metadata: { assigneeId: null },
        actor,
      }),
    ).toContain("unassigned");
  });

  it.each([
    ["null", null],
    ["a bare string", "oops"],
    ["a number", 42],
    ["an array", [1, 2, 3]],
    ["an empty object", {}],
    ["wrong keys", { unexpected: true }],
    ["non-string values where strings are expected", { from: 1, to: 2 }],
    ["deeply nested junk", { from: { nested: ["x"] }, to: undefined }],
  ])("does not throw on %s metadata", (_label, metadata) => {
    for (const type of Object.values(ActivityType)) {
      expect(() =>
        describeActivity({ type, metadata, actor }),
      ).not.toThrow();
      // And still returns something renderable.
      expect(describeActivity({ type, metadata, actor })).toBeTruthy();
    }
  });

  it("handles an unknown activity type without throwing", () => {
    expect(
      describeActivity({
        // Simulates a row written by a newer deploy than this code.
        type: "SOMETHING_NEW" as ActivityType,
        metadata: {},
        actor,
      }),
    ).toBe("Aditya Gupta updated this issue");
  });
});

describe("relativeTime", () => {
  it("reports just now for the present", () => {
    expect(relativeTime(new Date())).toBe("just now");
  });

  it.each([
    [90_000, "minute"],
    [3 * 3_600_000, "hour"],
    [2 * 86_400_000, "day"],
    [40 * 86_400_000, "month"],
    [400 * 86_400_000, "year"],
  ])("picks the right unit for %ims ago", (ago, unit) => {
    const text = relativeTime(new Date(Date.now() - ago));
    expect(text).toContain(unit);
  });

  it("does not crash on a future date", () => {
    expect(() => relativeTime(new Date(Date.now() + 86_400_000))).not.toThrow();
  });
});
