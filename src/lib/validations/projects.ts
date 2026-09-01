import { z } from "zod";

/**
 * A project key is the prefix in an issue key: FLOW in FLOW-124.
 *
 * Constraints exist because it ends up in URLs and in every issue reference:
 *  - letters and digits only, so it never needs escaping in a path
 *  - must start with a letter, so a key can never be mistaken for an issue
 *    number (parseIssueKey enforces the same rule at the other end)
 *  - 2-8 characters: shorter is unreadable, longer stops being a shorthand
 */
export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, "Use at least 2 characters")
  .max(8, "Use no more than 8 characters")
  .regex(/^[A-Z][A-Z0-9]*$/, "Letters and digits only, starting with a letter");

export const createProjectSchema = z.object({
  workspaceId: z.string().min(1, "Choose a workspace"),
  name: z.string().trim().min(1, "Enter a project name").max(80, "Name is too long"),
  key: projectKeySchema,
  description: z.string().trim().max(500, "Description is too long").optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Suggest a key from a project name: "Mobile App" -> "MA", "Flowboard" -> "FLOW".
 *
 * A suggestion only -- the field stays editable. Auto-deriving a key and hiding
 * the field would bake a guess into every issue reference forever.
 */
export function suggestProjectKey(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  // Multiple words: initials, which is what people expect.
  if (words.length > 1) {
    return words
      .map((word) => word[0] ?? "")
      .join("")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
  }

  // Single word: the first four letters.
  return words[0]!.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}
