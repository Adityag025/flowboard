import { describe, expect, it } from "vitest";

import { parseIssueKey } from "./issues";

/**
 * parseIssueKey reads a URL segment, so its input is fully attacker-controlled.
 * Anything it accepts becomes a database query; anything it wrongly rejects is a
 * broken link.
 */
describe("parseIssueKey", () => {
  it("parses a normal key", () => {
    expect(parseIssueKey("FLOW-124")).toEqual({ projectKey: "FLOW", number: 124 });
  });

  it("uppercases the project key", () => {
    expect(parseIssueKey("flow-124")).toEqual({ projectKey: "FLOW", number: 124 });
  });

  it("handles URL encoding", () => {
    expect(parseIssueKey("FLOW%2D124")).toEqual({ projectKey: "FLOW", number: 124 });
  });

  it("accepts digits inside the project key but not leading them", () => {
    expect(parseIssueKey("WEB2-1")).toEqual({ projectKey: "WEB2", number: 1 });
    expect(parseIssueKey("2WEB-1")).toBeNull();
  });

  it.each([
    ["", "empty"],
    ["FLOW", "no number"],
    ["FLOW-", "trailing dash only"],
    ["-124", "no project key"],
    ["FLOW-0", "issue numbers start at 1"],
    ["FLOW--1", "double dash"],
    ["FLOW-1.5", "not an integer"],
    ["FLOW-abc", "non-numeric"],
    ["FLOW-1 OR 1=1", "sql-ish payload"],
    ["../../etc/passwd", "traversal"],
    ["FLOW-1;DROP TABLE issues", "statement injection"],
    ["<script>-1", "html"],
  ])("rejects %j (%s)", (input) => {
    expect(parseIssueKey(input)).toBeNull();
  });

  it("rejects a number too large to be a safe integer", () => {
    expect(parseIssueKey("FLOW-99999999999999999999")).toBeNull();
  });

  it("rejects a negative number", () => {
    // The regex requires digits after the dash, so "-1" cannot reach Number().
    expect(parseIssueKey("FLOW--1")).toBeNull();
  });
});
