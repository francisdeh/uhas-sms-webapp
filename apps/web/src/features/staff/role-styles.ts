import type { StaffSystemRole } from "@/features/staff/types";

// Shared by StaffTable and StaffDetail — was previously duplicated
// identically in both files. Labels come from the app-wide
// ROLE_LABELS in @/features/auth/types; these two are visual-only and
// specific to how staff rows/cards render a role.
export const STAFF_ROLE_AVATAR: Record<StaffSystemRole, string> = {
  Admin: "from-purple-400 to-purple-600",
  DeputyHead: "from-blue-400 to-blue-600",
  Teacher: "from-orange-400 to-accent-orange",
  Accountant: "from-emerald-400 to-emerald-600",
};

export const STAFF_ROLE_PILL: Record<StaffSystemRole, string> = {
  Admin: "bg-purple-100 text-purple-700",
  DeputyHead: "bg-blue-100 text-blue-700",
  Teacher: "bg-orange-100 text-accent-orange",
  Accountant: "bg-emerald-100 text-emerald-700",
};
