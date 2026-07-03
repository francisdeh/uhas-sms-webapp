import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { getApi, ApiError } from "@/lib/api/server";
import { StaffAttendanceSheet } from "@/features/attendance/components/StaffAttendanceSheet";
import type {
  StaffSessionWithRecords,
  LeaveRequest,
} from "@/features/attendance/types";
import type { Staff } from "@/features/staff/types";

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

  const api = await getApi();
  const [existingSession, allStaffPage, approvedLeavePage] = await Promise.all([
    // 404 → no session for that division/date yet; treat as null.
    api.staffAttendance
      .lookupSession({ division, date })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }),
    api.staff.list({ size: 500 }),
    api.leaveRequests.list({ status: "approved", size: 500 }),
  ]);

  const allStaff = allStaffPage.items as unknown as Staff[];
  const staff = allStaff.filter((s) => s.division === division && s.isActive);

  const approvedLeave = approvedLeavePage.items as unknown as LeaveRequest[];
  const approvedLeaveStaffIds = new Set(
    approvedLeave
      .filter((r) => r.startDate <= date && r.endDate >= date)
      .map((r) => r.staffId),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Staff Attendance</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{division} Division</p>
      </div>
      <StaffAttendanceSheet
        session={existingSession as unknown as StaffSessionWithRecords | null}
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
