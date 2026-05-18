import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listCalendarEventsAction } from "@/features/reports/actions/calendar";
import { CalendarView } from "@/features/reports/components/CalendarView";

export default async function TeacherCalendarPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const events = await listCalendarEventsAction();
  return <CalendarView events={events} />;
}
