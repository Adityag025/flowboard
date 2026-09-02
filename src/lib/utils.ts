import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, resolving Tailwind conflicts by last-one-wins.
 *
 * clsx alone would keep both of a conflicting pair -- `cn("p-2", "p-4")` would
 * emit "p-2 p-4" and the winner would depend on the order Tailwind happened to
 * emit those rules in the stylesheet, not on the call site. twMerge understands
 * that p-2 and p-4 occupy the same slot and drops the earlier one, which is what
 * makes a `className` prop able to override a component's own defaults.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
