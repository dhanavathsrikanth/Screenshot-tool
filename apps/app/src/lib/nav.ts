import type { IconName } from "@/components/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  hint?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: "grid" },
      { href: "/playground", label: "Playground", icon: "play" },
      { href: "/logs", label: "Capture history", icon: "list" },
      { href: "/analytics", label: "Analytics", icon: "chart" },
    ],
  },
  {
    label: "Developer",
    items: [
      { href: "/api-keys", label: "API keys", icon: "key" },
      { href: "/docs", label: "Documentation", icon: "book" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/billing", label: "Billing", icon: "card" },
      { href: "/settings", label: "Settings", icon: "gear" },
    ],
  },
];
