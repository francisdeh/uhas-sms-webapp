import {
  LayoutDashboard,
  Users,
  UserCog,
  GraduationCap,
  BookOpen,
  ClipboardCheck,
  FileText,
  BarChart2,
  Settings,
  School,
  ClipboardList,
  Bell,
  User,
  Calendar,
  ArrowUpRight,
  History,
} from "lucide-react";
import type { UserRole, SessionUser } from "@/features/auth/types";
import type { NavGroup, ShellConfig } from "./types";

export const ROLE_CONFIG: Record<UserRole, ShellConfig> = {
  Admin: {
    label: "Admin",
    navGroups: [
      {
        items: [{ label: "Overview", href: "/admin", icon: LayoutDashboard }],
      },
      {
        groupLabel: "People",
        items: [
          { label: "Students", href: "/admin/students", icon: GraduationCap },
          { label: "Staff", href: "/admin/staff", icon: UserCog },
          { label: "Users", href: "/admin/users", icon: Users },
        ],
      },
      {
        groupLabel: "Academic",
        items: [
          { label: "Classes", href: "/admin/classes", icon: School },
          { label: "Attendance", href: "/admin/attendance", icon: ClipboardCheck },
          { label: "Examinations", href: "/admin/examinations", icon: FileText },
          { label: "Lesson Plans", href: "/admin/lesson-plans", icon: BookOpen },
          { label: "Schemes", href: "/admin/schemes", icon: ClipboardList },
          { label: "Promotions", href: "/admin/promotions", icon: ArrowUpRight },
        ],
      },
      {
        groupLabel: "Communication",
        items: [
          { label: "Announcements", href: "/admin/announcements", icon: Bell },
          { label: "Calendar", href: "/admin/calendar", icon: Calendar },
        ],
      },
      {
        groupLabel: "System",
        items: [
          { label: "Reports", href: "/admin/reports", icon: BarChart2 },
          { label: "Audit log", href: "/admin/audit-log", icon: History },
          { label: "Settings", href: "/admin/settings", icon: Settings },
        ],
      },
    ],
  },

  DeputyHead: {
    label: "Deputy Head",
    navGroups: [
      {
        items: [{ label: "Overview", href: "/deputy-head", icon: LayoutDashboard }],
      },
      {
        groupLabel: "People",
        items: [
          { label: "Students", href: "/deputy-head/students", icon: GraduationCap },
        ],
      },
      {
        groupLabel: "Academic",
        items: [
          { label: "Classes", href: "/deputy-head/classes", icon: School },
          { label: "Attendance", href: "/deputy-head/attendance", icon: ClipboardCheck },
          { label: "Lesson Plans", href: "/deputy-head/lesson-plans", icon: BookOpen },
          { label: "Promotions", href: "/deputy-head/promotions", icon: ArrowUpRight },
        ],
      },
      {
        groupLabel: "Communication",
        items: [
          { label: "Announcements", href: "/deputy-head/announcements", icon: Bell },
          { label: "Calendar", href: "/deputy-head/calendar", icon: Calendar },
        ],
      },
      {
        groupLabel: "System",
        items: [{ label: "Reports", href: "/deputy-head/reports", icon: BarChart2 }],
      },
    ],
  },

  Teacher: {
    label: "Teacher",
    navGroups: [
      {
        items: [{ label: "Overview", href: "/teacher", icon: LayoutDashboard }],
      },
      {
        groupLabel: "Teaching",
        items: [
          { label: "My Classes", href: "/teacher/classes", icon: School },
          { label: "Attendance", href: "/teacher/attendance", icon: ClipboardCheck },
          { label: "Lesson Plans", href: "/teacher/lesson-plans", icon: BookOpen },
          { label: "Schemes", href: "/teacher/schemes", icon: ClipboardList },
          { label: "Assignments", href: "/teacher/assignments", icon: ClipboardList },
          { label: "Examinations", href: "/teacher/examinations", icon: FileText },
          { label: "Class Reports", href: "/teacher/class-reports", icon: ClipboardList },
          { label: "Promotions", href: "/teacher/promotions", icon: ArrowUpRight },
        ],
      },
      {
        groupLabel: "Communication",
        items: [
          { label: "Announcements", href: "/teacher/announcements", icon: Bell },
          { label: "Appointments", href: "/teacher/appointments", icon: Calendar },
          { label: "Calendar", href: "/teacher/calendar", icon: Calendar },
        ],
      },
      {
        groupLabel: "System",
        items: [{ label: "Reports", href: "/teacher/reports", icon: BarChart2 }],
      },
    ],
  },

  Parent: {
    label: "Parent",
    navGroups: [
      {
        items: [{ label: "Overview", href: "/parent", icon: LayoutDashboard }],
      },
      {
        groupLabel: "My Children",
        items: [
          { label: "Children", href: "/parent/children", icon: User },
          { label: "Attendance", href: "/parent/attendance", icon: ClipboardList },
          { label: "Assignments", href: "/parent/assignments", icon: BookOpen },
          { label: "Results", href: "/parent/results", icon: FileText },
          { label: "Announcements", href: "/parent/announcements", icon: Bell },
          { label: "Appointments", href: "/parent/appointments", icon: Calendar },
          { label: "Calendar", href: "/parent/calendar", icon: Calendar },
        ],
      },
    ],
  },
};

const UNIT_HEAD_NAV: NavGroup = {
  groupLabel: "Unit Head",
  items: [
    { label: "Department", href: "/teacher/department", icon: School },
    { label: "Reviews", href: "/teacher/reviews", icon: ClipboardList },
  ],
};

export function getShellConfig(user: Pick<SessionUser, "role" | "isUnitHead">): ShellConfig {
  const base = ROLE_CONFIG[user.role];
  if (user.role === "Teacher" && user.isUnitHead) {
    return {
      ...base,
      navGroups: [...base.navGroups.slice(0, -1), UNIT_HEAD_NAV, ...base.navGroups.slice(-1)],
    };
  }
  return base;
}
