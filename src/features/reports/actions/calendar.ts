"use server";

import { mockCalendarEvents } from "@/lib/mock/calendar-events";
import { mockStaff } from "@/lib/mock/staff";
import type {
  CalendarEvent,
  CreateCalendarEventInput,
} from "@/features/reports/types";

type ActionResult = { success: true } | { success: false; error: string };

const calendarEvents = mockCalendarEvents;

export async function listCalendarEventsAction(): Promise<CalendarEvent[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  return [...calendarEvents].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export async function createCalendarEventAction(input: {
  authorId: string;
  data: CreateCalendarEventInput;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };
  const author = mockStaff.find((s) => s.id === input.authorId);
  if (!author || author.systemRole !== "Admin") {
    return { success: false, error: "Only Admin can manage the academic calendar." };
  }
  if (input.data.endDate && input.data.endDate < input.data.startDate) {
    return { success: false, error: "End date must be after start date." };
  }
  const id = `cal-${Date.now()}`;
  calendarEvents.push({
    id,
    schoolId: "school-uhas-001",
    title: input.data.title,
    description: input.data.description ?? null,
    startDate: input.data.startDate,
    endDate: input.data.endDate ?? null,
    type: input.data.type,
    createdById: author.id,
    createdAt: new Date().toISOString(),
  });
  return { success: true, id };
}

export async function deleteCalendarEventAction(input: {
  id: string;
  authorId: string;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };
  const author = mockStaff.find((s) => s.id === input.authorId);
  if (!author || author.systemRole !== "Admin") {
    return { success: false, error: "Only Admin can delete calendar events." };
  }
  const idx = calendarEvents.findIndex((e) => e.id === input.id);
  if (idx === -1) return { success: false, error: "Event not found." };
  calendarEvents.splice(idx, 1);
  return { success: true };
}
