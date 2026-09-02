"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { cn } from "@/lib/utils";
import { primaryNav, secondaryNav, type NavItem } from "./nav-config";
import { useSidebar } from "./sidebar-context";

/**
 * Sidebar is a Client Component for exactly two reasons:
 *   1. usePathname() -- to highlight the active route
 *   2. the mobile drawer's open/closed state
 *
 * Both are genuinely interactive. Neither can be done on the server.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close } = useSidebar();

  // Close the drawer after navigating. Without this the drawer stays open on
  // top of the page the user just asked for.
  useEffect(() => {
    close();
    // Intentionally keyed on pathname only: including `close` would re-run this
    // whenever the context value changes, closing the drawer as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* Mobile backdrop. Hidden on desktop, where the sidebar is permanent. */}
      <div
        onClick={close}
        aria-hidden="true"
        className={cn(
          "fixed inset-0 top-11 z-30 bg-black/40 transition-opacity duration-[var(--dur-drawer)] ease-[var(--ease-out-strong)] lg:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        aria-label="Workspace navigation"
        className={cn(
          // The drawer curve, not the default ease-out: a panel sliding the full width
          // of the screen wants a curve that decelerates late, or it looks like it
          // stops short.
          "fixed bottom-0 left-0 top-11 z-40 flex w-[264px] flex-col border-r border-border bg-canvas transition-transform duration-[var(--dur-drawer)] ease-[var(--ease-drawer)]",
          // On desktop the sidebar is always visible; the transform is neutralised.
          "lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="px-3 pt-4">
          <p className="rule-label">workspace</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {primaryNav.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>

        <nav className="flex flex-col gap-1 border-t border-border p-3">
          {secondaryNav.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
      </aside>
    </>
  );
}

function SidebarLink({ item, pathname }: { item: NavItem; pathname: string }) {
  // startsWith keeps the parent highlighted on detail pages, e.g. /issues/FLOW-124
  // still lights up "Issues". The exact check handles the route itself.
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        // A 2px left marker marks the active route instead of a filled pill.
        // Boxes are what the whole design is trying to avoid, and a marker in
        // the gutter is how a terminal shows position.
        "flex items-center gap-2.5 border-l-2 px-3 py-1.5 text-xs uppercase tracking-wider transition-colors",
        isActive
          ? "border-accent text-accent"
          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {item.label}
    </Link>
  );
}
