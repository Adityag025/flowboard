"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";

import { GlobalSearch } from "./global-search";
import { useSidebar } from "./sidebar-context";
import { UserMenu, type SessionUser } from "./user-menu";

/**
 * Client Component because of the drawer toggle. `user` arrives as a plain
 * serialisable object from the server layout -- functions and class instances
 * cannot cross that boundary, but data can.
 *
 */
export function Header({ user }: { user: SessionUser }) {
  const { isOpen, toggle } = useSidebar();

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-11 items-center gap-3 border-b border-border bg-canvas px-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={isOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={isOpen}
        className="-ml-1 rounded-md p-2 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground lg:hidden"
      >
        {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      <Link href="/dashboard" className="flex items-center gap-1.5">
        {/* A bracketed wordmark rather than a rounded logo tile: the brackets
            are the motif, and they cost no image. */}
        <span className="text-accent">[</span>
        <span className="text-xs font-semibold uppercase tracking-[0.18em]">
          flowboard
        </span>
        <span className="text-accent">]</span>
      </Link>

      <div className="flex-1" />

      <GlobalSearch />

      <UserMenu user={user} />
    </header>
  );
}
