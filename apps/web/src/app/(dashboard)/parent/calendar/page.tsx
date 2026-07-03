import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { CalendarView } from "@/features/reports/components/CalendarView";
import type { CalendarEvent } from "@/features/reports/types";

export default async function ParentCalendarPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  const events = (await api.calendar.list()).items as unknown as CalendarEvent[];
  return <CalendarView events={events} />;
}
