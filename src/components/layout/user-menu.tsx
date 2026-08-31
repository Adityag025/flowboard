"use client";

import { useEffect, useRef, useState } from "react";

import { signOutAction } from "@/lib/actions/auth";

export type SessionUser = {
  name: string | null;
  email: string | null;
};

/** "Aditya Gupta" -> "AG". Falls back to the email's first letter. */
function initials(user: SessionUser): string {
  const source = user.name?.trim();
  if (source) {
    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("");
  }
  return user.email?.[0]?.toUpperCase() ?? "?";
}

export function UserMenu({ user }: { user: SessionUser }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape. Both are expected of any menu, and
  // their absence is the kind of thing that feels broken without being
  // obviously wrong.
  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Account menu"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-subtle text-xs font-semibold text-accent transition-opacity hover:opacity-80"
      >
        {initials(user)}
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-10 w-56 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>

          {/*
            Sign-out is a FORM, not an onClick fetch. It mutates server state,
            so it must be a POST -- a GET logout link can be triggered by any
            image tag on any page and would log users out unexpectedly.
          */}
          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className="w-full px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
