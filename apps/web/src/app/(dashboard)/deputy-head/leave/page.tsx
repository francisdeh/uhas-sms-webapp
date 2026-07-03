import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { getApi } from "@/lib/api/server";
import { LeaveRequestList } from "@/features/attendance/components/LeaveRequestList";
import type { LeaveRequest } from "@/features/attendance/types";

export default async function DeputyHeadLeavePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);
  if (!division) notFound();

  // Server infers division scope from the deputy's JWT.
  const api = await getApi();
  const requests = (await api.leaveRequests.list({ size: 200 }))
    .items as unknown as LeaveRequest[];

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <h1 className="text-xl font-bold mb-1">Leave Requests</h1>
      <p className="text-sm text-muted-foreground mb-6">{division} Division</p>
      <LeaveRequestList
        requests={requests}
        currentUserId={user.linkedId ?? ""}
        currentUserName={user.displayName}
      />
    </div>
  );
}
