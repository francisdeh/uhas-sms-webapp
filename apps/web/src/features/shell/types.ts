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

export type GlobalSearchResults = {
  students: { id: string; slug: string; name: string }[];
  staff: { id: string; slug: string; name: string }[];
  classes: { id: string; name: string }[];
  feeItems: { id: string; name: string }[];
  lessonPlans: { id: string; topic: string }[];
  schemes: { id: string; title: string }[];
};
