import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { Badge } from "@/components/ui/badge";
import { LeaveRequestList } from "@/features/attendance/components/LeaveRequestList";
import { toLeaveRequest } from "@/features/leave-requests/mappers";

export default async function AdminLeavePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // No staffId/division filter — Admin sees every leave request in the
  // school; the backend only narrows by division for Deputy Head.
  const api = await getApi();
  const requests = (await api.leaveRequests.list({ size: 200 })).items.map(toLeaveRequest);
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Leave Requests</h1>
            <Badge className="bg-amber-100 text-amber-700">{pendingCount} pending</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">All divisions</p>
        </div>
      </div>
      <LeaveRequestList requests={requests} scopeDescription="your school" />
    </div>
  );
}
