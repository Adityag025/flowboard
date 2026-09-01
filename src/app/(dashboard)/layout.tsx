import { redirect } from "next/navigation";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { auth } from "@/lib/auth";

/**
 * The application shell -- and the second of two auth checks.
 *
 * Middleware already redirects unauthenticated requests away from these
 * routes, so why check again? Because middleware is a matcher pattern, and a
 * matcher is one typo away from silently not covering a route. This check is
 * the one that actually guarantees `session.user` exists for everything
 * rendered below, which is why the pages can use it without null-checking.
 *
 * Belt and braces on an auth boundary is not redundancy; it is the point.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <SidebarProvider>
      <Header
        user={{ name: session.user.name ?? null, email: session.user.email ?? null }}
      />
      <Sidebar />
      {/*
        This padding MUST match the sidebar's width. The sidebar is `fixed`, so
        it is out of the layout flow and the main column has to reserve the space
        itself -- change one without the other and the content either sits under
        the sidebar or leaves a gap beside it.
      */}
      <main className="pt-11 lg:pl-[264px]">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</div>
      </main>
    </SidebarProvider>
  );
}
