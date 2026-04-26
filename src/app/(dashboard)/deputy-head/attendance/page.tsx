import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { listStaffAction } from "@/features/staff/actions";
import {
  getStaffSessionForDivisionDateAction,
  listLeaveRequestsAction,
} from "@/features/attendance/actions";
import { StaffAttendanceSheet } from "@/features/attendance/components/StaffAttendanceSheet";

interface Props {
  searchParams: Promise<{ date?: string }>;
}

export default async function DeputyHeadAttendancePage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);
  if (!division) notFound();

  const { date: rawDate } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const date = rawDate ?? today;
  const editable = date === today;

  const [existingSession, allStaff, approvedLeave] = await Promise.all([
    getStaffSessionForDivisionDateAction(division, date),
    listStaffAction(),
    listLeaveRequestsAction({ division, status: "approved" }),
  ]);

  const staff = allStaff.filter((s) => s.division === division && s.isActive);

  const approvedLeaveStaffIds = new Set(
    approvedLeave
      .filter((r) => r.startDate <= date && r.endDate >= date)
      .map((r) => r.staffId)
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Staff Attendance</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{division} Division</p>
      </div>
      <StaffAttendanceSheet
        session={existingSession}
        division={division}
        date={date}
        term={1}
        staff={staff}
        approvedLeaveStaffIds={approvedLeaveStaffIds}
        submittedById={user.linkedId ?? ""}
        editable={editable}
      />
    </div>
  );
}
