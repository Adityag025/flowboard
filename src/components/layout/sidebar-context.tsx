"use client";

import { createContext, useContext, useMemo, useState } from "react";

type SidebarContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

/**
 * Holds the mobile drawer's open/closed state.
 *
 * The state has to live above both Header (the hamburger that opens it) and
 * Sidebar (the drawer itself), because neither is an ancestor of the other.
 *
 * THE KEY POINT: this is a Client Component, but the `children` it renders are
 * NOT dragged into the client bundle. Children arrive as an already-rendered
 * prop from the Server Component that composed them. So our pages stay server
 * components -- free to hit the database directly in Stage 4 -- even though
 * they render inside a client provider.
 *
 * "use client" marks an ENTRY POINT into the client bundle, not a boundary
 * that infects everything below it in the tree.
 */
export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  // Without useMemo, this object is a new reference on every render, and every
  // consumer of the context re-renders whether or not the value changed.
  const value = useMemo<SidebarContextValue>(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((prev) => !prev),
    }),
    [isOpen],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used inside <SidebarProvider>");
  }
  return context;
}
