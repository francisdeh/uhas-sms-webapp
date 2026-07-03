import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { CalendarView } from "@/features/reports/components/CalendarView";
import type { CalendarEvent } from "@/features/reports/types";

export default async function AdminCalendarPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const resp = await api.calendar.list({ size: 200 });
  const events: CalendarEvent[] = resp.items.map((e) => ({
    id: e.id,
    schoolId: e.schoolId,
    title: e.title,
    description: e.description ?? null,
    startDate: e.startDate,
    endDate: e.endDate ?? null,
    type: e.type,
    createdById: e.createdById,
    createdAt: e.createdAt ?? new Date().toISOString(),
  }));
  return <CalendarView events={events} authorId={user.linkedId} canManage />;
}
