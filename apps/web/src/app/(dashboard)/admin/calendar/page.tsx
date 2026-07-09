import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCalendarWithTerms } from "@/features/reports/queries/get-calendar-with-terms";
import { CalendarView } from "@/features/reports/components/CalendarView";

export default async function AdminCalendarPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const events = await getCalendarWithTerms();
  return <CalendarView events={events} authorId={user.linkedId} canManage />;
}
