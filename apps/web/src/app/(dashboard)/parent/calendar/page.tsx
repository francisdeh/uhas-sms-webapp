import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCalendarWithTerms } from "@/features/reports/queries/get-calendar-with-terms";
import { CalendarView } from "@/features/reports/components/CalendarView";

export default async function ParentCalendarPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const events = await getCalendarWithTerms();
  return <CalendarView events={events} />;
}
