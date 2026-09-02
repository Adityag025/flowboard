"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toast host.
 *
 * WHY A TOAST AT ALL: until now every confirmation in this app was inline text
 * next to the control that caused it, which works for a form but not for an
 * action whose result appears somewhere else -- dragging a card between board
 * columns, or an optimistic update that later fails on the server. Those need
 * feedback that is not tied to the position of the thing you clicked.
 *
 * WHAT WAS REMOVED FROM shadcn's TEMPLATE, and why:
 *
 *   next-themes. The template reads `useTheme()` to pick a toast theme. This
 *   app has no ThemeProvider and no theme switcher -- it themes off
 *   prefers-color-scheme with a `data-theme` escape hatch -- so `useTheme()`
 *   could only ever return its "system" default. That is a dependency whose
 *   entire contribution was a constant, so the constant is written here
 *   instead and the package uninstalled. Sonner's own "system" resolves
 *   against prefers-color-scheme, which is the same signal the tokens use, so
 *   the behaviour is identical.
 *
 *   The five lucide icons. Status in this interface is a glyph (see
 *   `statusGlyphs` in lib/issues.ts and the Badge component) -- a toast with a
 *   drawn icon would be the one place that breaks the convention. These are
 *   monospace characters, so they occupy the same cell as the text beside them.
 */
const Toaster = (props: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      // Bottom-right, and close to the edge: a terminal writes at the edges.
      position="bottom-right"
      offset={16}
      icons={{
        success: <span aria-hidden>✓</span>,
        info: <span aria-hidden>·</span>,
        warning: <span aria-hidden>!</span>,
        error: <span aria-hidden>✕</span>,
        loading: <span aria-hidden>◐</span>,
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "0",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast !rounded-none !border !border-border !bg-surface !font-mono !text-[13px] !text-foreground",
          description: "!text-muted-foreground",
          actionButton: "!bg-accent !text-accent-foreground !rounded-none",
          cancelButton:
            "!bg-surface-hover !text-foreground !rounded-none !border !border-border",
          icon: "!text-accent",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
