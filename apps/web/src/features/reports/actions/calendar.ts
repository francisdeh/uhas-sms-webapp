"use server";
import type { ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, staff } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import type {
  CalendarEvent,
  CreateCalendarEventInput,
} from "@/features/reports/types";


function toEvent(row: typeof calendarEvents.$inferSelect): CalendarEvent {
  return {
    id: row.id,
    schoolId: row.schoolId,
    title: row.title,
    description: row.description,
    startDate: row.startDate,
    endDate: row.endDate,
    type: row.type as CalendarEvent["type"],
    createdById: row.createdById,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function listCalendarEventsAction(): Promise<CalendarEvent[]> {
  const schoolId = await getCurrentSchoolId();
  const rows = await db.query.calendarEvents.findMany({
    where: eq(calendarEvents.schoolId, schoolId),
    orderBy: [asc(calendarEvents.startDate)],
  });
  return rows.map(toEvent);
}

export async function createCalendarEventAction(input: {
  authorId: string;
  data: CreateCalendarEventInput;
}): Promise<ActionResult<{ id: string }>> {
  const author = await db.query.staff.findFirst({ where: eq(staff.id, input.authorId) });
  if (!author || author.systemRole !== "Admin") {
    return { success: false, error: "Only Admin can manage the academic calendar." };
  }
  if (input.data.endDate && input.data.endDate < input.data.startDate) {
    return { success: false, error: "End date must be after start date." };
  }
  const id = `cal-${Date.now()}`;
  const schoolId = await getCurrentSchoolId();
  await db.insert(calendarEvents).values({
    id,
    schoolId,
    title: input.data.title,
    description: input.data.description ?? null,
    startDate: input.data.startDate,
    endDate: input.data.endDate ?? null,
    type: input.data.type,
    createdById: author.id,
  });
  revalidatePath("/admin/calendar");
  return { success: true, id };
}

export async function deleteCalendarEventAction(input: {
  id: string;
  authorId: string;
}): Promise<ActionResult> {
  const author = await db.query.staff.findFirst({ where: eq(staff.id, input.authorId) });
  if (!author || author.systemRole !== "Admin") {
    return { success: false, error: "Only Admin can delete calendar events." };
  }
  const row = await db.query.calendarEvents.findFirst({
    where: eq(calendarEvents.id, input.id),
  });
  if (!row) return { success: false, error: "Event not found." };
  await db.delete(calendarEvents).where(eq(calendarEvents.id, input.id));
  revalidatePath("/admin/calendar");
  return { success: true };
}
