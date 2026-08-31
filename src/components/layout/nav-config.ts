import {
  BarChart3,
  CircleDot,
  LayoutDashboard,
  Settings,
  SquareKanban,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/**
 * Single source of truth for navigation.
 *
 * This module is imported by Sidebar, which is a Client Component -- so this
 * file lands in the client bundle too. That is deliberate: `icon` holds a
 * component reference, and functions cannot cross the server/client boundary
 * as serialized props. Importing the config directly inside the client
 * component sidesteps the boundary entirely.
 */
export const primaryNav: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: SquareKanban },
  { href: "/issues", label: "Issues", icon: CircleDot },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export const secondaryNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];
