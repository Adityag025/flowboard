/**
 * Map label NAMES chosen by a model onto label IDS that actually exist.
 *
 * Extracted from draftIssueAction so this rule is testable on its own, because
 * it is the security-relevant part of accepting model output:
 *
 *   THE MODEL NEVER DECIDES WHAT ROWS EXIST.
 *
 * A schema guarantees the SHAPE of the output, not its CONTENT. The prompt says
 * "choose only from the provided list", and models mostly comply -- but "mostly"
 * is not a guarantee, and a hallucinated label must be dropped rather than
 * created. Names are therefore resolved against the labels fetched for THIS
 * user, which also means a label from a workspace they cannot see is impossible
 * to attach even if the model somehow named one.
 */
export function resolveLabelIds(
  names: readonly string[],
  available: readonly { id: string; name: string }[],
): string[] {
  const byName = new Map(available.map((label) => [label.name.trim().toLowerCase(), label.id]));

  return [
    // Set dedupes: a model repeating a label must not produce two rows, which
    // the composite primary key on issue_labels would reject anyway.
    ...new Set(
      names
        // Case- and whitespace-insensitive, because "Backend" and " backend "
        // are obviously the same label to a human and the model is writing prose.
        .map((name) => byName.get(name.trim().toLowerCase()))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}
