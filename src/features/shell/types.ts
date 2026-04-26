import type { LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
};

export type NavGroup = {
  groupLabel?: string;
  items: NavItem[];
};

export type ShellConfig = {
  label: string;
  navGroups: NavGroup[];
};
