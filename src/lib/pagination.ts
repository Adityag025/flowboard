/**
 * Keyset (cursor) pagination, not offset pagination.
 *
 * WHY NOT skip/take, which is the obvious choice:
 *
 * The issue list is ordered by `updatedAt DESC`, and ANY edit bumps updatedAt --
 * a comment, a status change, a drag on the board. With offset pagination, a row
 * on page 1 that gets edited while you are reading page 2 shifts everything
 * down, so you see a row twice; a row that moves the other way is skipped
 * entirely. On a busy tracker that is not an edge case, it is Tuesday.
 *
 * Offset also gets slower the deeper you go: OFFSET 10000 makes Postgres walk
 * and discard 10,000 rows every time.
 *
 * Keyset says "give me rows after THIS specific row" instead of "skip 50". It is
 * stable under concurrent edits and uses the index directly, so page 200 costs
 * the same as page 1.
 *
 * THE TRADE, stated honestly: you cannot jump to page 7, and there is no page
 * count. That is why the UI offers "Next" rather than numbered pages. For an
 * issue tracker that is the right trade -- nobody navigates to page 7 of issues,
 * they filter instead.
 *
 * The cursor needs BOTH updatedAt and id because updatedAt is not unique: two
 * issues touched in the same millisecond would make the boundary ambiguous, and
 * the row on the seam would repeat or vanish. This is also why the list's
 * orderBy has carried an `id` tiebreaker since Stage 5.
 */

export type Cursor = { updatedAt: Date; id: string };

/**
 * Cursors are opaque to the client on purpose: base64 signals "do not
 * construct this yourself". It is NOT security -- it is trivially decodable, and
 * a hand-crafted cursor can only ever narrow a query that is already scoped by
 * workspace membership.
 */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.updatedAt.toISOString()}|${cursor.id}`).toString(
    "base64url",
  );
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    // indexOf, not lastIndexOf: the ISO timestamp is a fixed-format prefix that
    // can never contain "|", so the FIRST separator is the boundary and
    // everything after it is the id. Using lastIndexOf broke on any id
    // containing the separator -- it split the date instead. Caught by a test.
    const separator = decoded.indexOf("|");
    if (separator === -1) return null;

    const updatedAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);

    // A malformed cursor must be ignored, not throw: it arrives in a URL that
    // anyone can edit, and a 500 on a bad query string is a denial of service
    // you inflicted on yourself.
    if (Number.isNaN(updatedAt.getTime()) || id.length === 0) return null;

    return { updatedAt, id };
  } catch {
    return null;
  }
}

/**
 * The WHERE fragment for "strictly after this cursor" given
 * `ORDER BY updatedAt DESC, id DESC`.
 *
 * Reads as: either the timestamp is strictly older, or it ties and the id
 * breaks it. Getting this wrong by using >= instead of > repeats the boundary
 * row on every page.
 */
export function cursorFilter(cursor: Cursor) {
  return {
    OR: [
      { updatedAt: { lt: cursor.updatedAt } },
      { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
    ],
  };
}
