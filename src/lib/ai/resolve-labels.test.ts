import { describe, expect, it } from "vitest";

import { resolveLabelIds } from "./resolve-labels";

const available = [
  { id: "l1", name: "backend" },
  { id: "l2", name: "authentication" },
  { id: "l3", name: "bug" },
];

describe("resolveLabelIds", () => {
  it("maps known names to ids", () => {
    expect(resolveLabelIds(["backend", "bug"], available)).toEqual(["l1", "l3"]);
  });

  it("DROPS a label the model invented", () => {
    // The single most important assertion here: a hallucinated label is silently
    // discarded, never created. The model does not get to add rows.
    expect(resolveLabelIds(["backend", "quantum-flux"], available)).toEqual(["l1"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(resolveLabelIds(["nope", "also-nope"], available)).toEqual([]);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(resolveLabelIds(["  BackEnd  ", "BUG"], available)).toEqual(["l1", "l3"]);
  });

  it("dedupes repeats", () => {
    // issue_labels has a composite primary key, so a duplicate would be rejected
    // by the database -- better to never send it.
    expect(resolveLabelIds(["bug", "bug", "BUG"], available)).toEqual(["l3"]);
  });

  it("returns nothing when the user has no labels at all", () => {
    expect(resolveLabelIds(["backend"], [])).toEqual([]);
  });

  it("cannot attach a label outside the provided set, even by exact id", () => {
    // Names are matched, not ids -- so naming a foreign label's ID resolves to
    // nothing rather than smuggling it through.
    expect(resolveLabelIds(["l1", "some-other-workspace-label-id"], available)).toEqual([]);
  });

  it("ignores empty and whitespace-only names", () => {
    expect(resolveLabelIds(["", "   ", "bug"], available)).toEqual(["l3"]);
  });
});
