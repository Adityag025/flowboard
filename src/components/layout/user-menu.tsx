"use client";

import { useRef } from "react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/**
 * Account menu.
 *
 * WHY THIS STOPPED BEING HAND-ROLLED: the previous version was a useState
 * boolean plus a useEffect that attached document-level `mousedown` and
 * `keydown` listeners to close on outside-click and Escape. That covered the
 * two failures you notice immediately and none of the ones you don't: focus was
 * never moved into the menu on open nor restored to the trigger on close, arrow
 * keys did nothing, Home/End did nothing, typing a letter didn't jump to a
 * matching item, and the menu could open clipped or off-screen because it was
 * absolutely positioned rather than collision-aware. Getting all of that right
 * is a genuinely hard problem that Base UI has already solved, which is the
 * actual argument for taking these primitives.
 *
 * The `mousedown` choice was also subtly wrong: closing on mousedown means a
 * drag that starts inside the menu and ends outside dismisses it mid-gesture.
 */
export function UserMenu({ user }: { user: SessionUser }) {
  const signOutFormRef = useRef<HTMLFormElement>(null);

  return (
    <>
      {/*
        Sign-out is a FORM, not an onClick fetch. It mutates server state, so it
        must be a POST -- a GET logout link can be triggered by any image tag on
        any page and would log users out unexpectedly.

        The form sits OUTSIDE the menu on purpose. Menu content is rendered in a
        portal and unmounts the instant an item is activated, so a submit button
        living inside it would race its own form's teardown. Keeping the form as
        a sibling means the submission cannot be cancelled by the menu closing.
      */}
      <form ref={signOutFormRef} action={signOutAction} className="hidden" />

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account menu"
          className="press grid size-8 shrink-0 place-items-center border border-border bg-accent-subtle text-xs font-semibold text-accent hover:bg-surface-hover"
        >
          {initials(user)}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {/*
            The Group wrapper is REQUIRED, not decorative. DropdownMenuLabel is
            Base UI's Menu.GroupLabel, which reads a group context to wire up
            `aria-labelledby` -- used outside a Group it throws at runtime
            ("MenuGroupContext is missing"). Both typecheck and `next build`
            pass without it, because it is a context lookup rather than a type
            error; only opening the menu reveals it.
          */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-sm font-medium text-foreground">
                {user.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem render={<Link href="/settings" />}>
            Settings
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => signOutFormRef.current?.requestSubmit()}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
