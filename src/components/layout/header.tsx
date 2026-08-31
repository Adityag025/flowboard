"use client";

import Link from "next/link";
import { Menu, Search, X } from "lucide-react";

import { useSidebar } from "./sidebar-context";
import { UserMenu, type SessionUser } from "./user-menu";

/**
 * Client Component because of the drawer toggle. `user` arrives as a plain
 * serialisable object from the server layout -- functions and class instances
 * cannot cross that boundary, but data can.
 *
 * The search field is still an inert placeholder; it becomes real in Stage 5.
 */
export function Header({ user }: { user: SessionUser }) {
  const { isOpen, toggle } = useSidebar();

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
      <button
        type="button"
        onClick={toggle}
        aria-label={isOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={isOpen}
        className="-ml-1 rounded-md p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground lg:hidden"
      >
        {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded bg-accent text-xs font-bold text-accent-foreground">
          F
        </span>
        <span className="text-sm font-semibold tracking-tight">FlowBoard</span>
      </Link>

      <div className="flex-1" />

      <div className="relative hidden sm:block">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder="Search issues..."
          className="h-8 w-56 rounded-md border border-border bg-canvas pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent"
        />
      </div>

      <UserMenu user={user} />
    </header>
  );
}
