import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { LeaveRequestForm } from "@/features/attendance/components/LeaveRequestForm";
import { MyLeaveRequests } from "@/features/attendance/components/MyLeaveRequests";
import type { LeaveRequest } from "@/features/attendance/types";

export default async function TeacherLeavePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  const requests = (await api.leaveRequests.list({ staffId: user.linkedId, size: 100 }))
    .items as unknown as LeaveRequest[];

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold mb-1">Leave Requests</h1>
        <p className="text-sm text-muted-foreground">Submit a new leave request or view existing ones.</p>
      </div>
      <LeaveRequestForm staffId={user.linkedId ?? ""} staffName={user.displayName} />
      <MyLeaveRequests requests={requests} />
    </div>
  );
}
