/** "Aditya Gupta" -> "aditya-gupta" */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * A short random suffix used to break slug collisions.
 *
 * Two people called "Aditya Gupta" would otherwise generate the same slug, and
 * the workspace slug is globally unique because it sits in a URL path.
 */
export function slugSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
