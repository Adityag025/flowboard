import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-context";

/**
 * The application shell.
 *
 * (dashboard) is a ROUTE GROUP -- parentheses mean the folder name is not part
 * of the URL. /dashboard, /projects and /issues all live at the top level but
 * share this layout. Stage 3's (auth) group will sit alongside it with a
 * completely different layout and no sidebar.
 *
 * This file is a SERVER Component. It ships no JavaScript of its own; only
 * Header and Sidebar cross into the client bundle. `children` is rendered on
 * the server and handed to the provider as an already-finished prop.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <Header />
      <Sidebar />
      <main className="pt-14 lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
      </main>
    </SidebarProvider>
  );
}
