import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes with conflict resolution.
 *
 * clsx handles conditionals: cn("p-2", isActive && "bg-accent")
 * twMerge handles collisions: cn("px-2", "px-4") -> "px-4"
 *
 * The second half is why this exists. Our ui/ components take a `className`
 * prop so callers can override styling. Without twMerge, a caller passing
 * "px-6" would emit `class="px-4 px-6"` and CSS source order -- not the
 * caller's intent -- decides the winner. That bug is miserable to track down.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
