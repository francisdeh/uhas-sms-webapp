import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import StaffDetail from "@/features/staff/components/StaffDetail";
import type { Staff, StaffSystemRole, TeacherRank } from "@/features/staff/types";
import { TEACHER_RANKS } from "@/features/staff/types";
import type { Division } from "@/features/auth/types";

const TEACHER_RANKS_SET = new Set<string>(TEACHER_RANKS);
function normalizeRank(rank: string | null | undefined): TeacherRank | null {
  return rank && TEACHER_RANKS_SET.has(rank) ? (rank as TeacherRank) : null;
}

export default async function AdminStaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const api = await getApi();
  let row;
  try {
    row = await api.staff.get(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const staff: Staff = {
    id: row.id,
    slug: row.slug,
    schoolId: row.schoolId,
    uhasId: row.uhasId ?? null,
    firstName: row.firstName,
    lastName: row.lastName,
    rank: normalizeRank(row.rank),
    systemRole: (row.systemRole as StaffSystemRole) ?? "Teacher",
    division: (row.division as Division | null) ?? null,
    isUnitHead: row.isUnitHead ?? false,
    unitHeadOf: (row.unitHeadOf as Division | null) ?? null,
    photoUrl: row.photoUrl ?? null,
    phone: row.phone ?? "",
    email: row.email ?? "",
    isActive: row.isActive ?? true,
    createdAt: row.createdAt ?? new Date().toISOString(),
  };

  return <StaffDetail staff={staff} />;
}
