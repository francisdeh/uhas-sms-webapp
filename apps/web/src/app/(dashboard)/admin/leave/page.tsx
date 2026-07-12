import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { LeaveRequestList } from "@/features/attendance/components/LeaveRequestList";
import { toLeaveRequest } from "@/features/leave-requests/mappers";

export default async function AdminLeavePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // No staffId/division filter — Admin sees every leave request in the
  // school; the backend only narrows by division for Deputy Head.
  const api = await getApi();
  const requests = (await api.leaveRequests.list({ size: 200 })).items.map(toLeaveRequest);

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <h1 className="text-xl font-bold mb-1">Leave Requests</h1>
      <p className="text-sm text-muted-foreground mb-6">All divisions</p>
      <LeaveRequestList requests={requests} scopeDescription="your school" />
    </div>
  );
}
