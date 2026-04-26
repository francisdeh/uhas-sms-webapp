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
} from "lucide-react";
import type { UserRole } from "@/features/auth/types";
import type { ShellConfig } from "./types";

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
        ],
      },
      {
        groupLabel: "System",
        items: [
          { label: "Reports", href: "/admin/reports", icon: BarChart2 },
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
          { label: "Lesson Plans", href: "/deputy-head/lesson-plans", icon: BookOpen, badge: 3 },
        ],
      },
      {
        groupLabel: "System",
        items: [{ label: "Reports", href: "/deputy-head/reports", icon: BarChart2 }],
      },
    ],
  },

  HOD: {
    label: "Head of Department",
    navGroups: [
      {
        items: [{ label: "Overview", href: "/hod", icon: LayoutDashboard }],
      },
      {
        groupLabel: "Department",
        items: [
          { label: "My Department", href: "/hod/department", icon: School },
          { label: "Lesson Plans", href: "/hod/lesson-plans", icon: BookOpen, badge: 2 },
          { label: "Examinations", href: "/hod/examinations", icon: FileText },
        ],
      },
      {
        groupLabel: "System",
        items: [{ label: "Reports", href: "/hod/reports", icon: BarChart2 }],
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
          { label: "Examinations", href: "/teacher/examinations", icon: FileText },
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
          { label: "Results", href: "/parent/results", icon: FileText },
          { label: "Announcements", href: "/parent/announcements", icon: Bell },
        ],
      },
    ],
  },
};
