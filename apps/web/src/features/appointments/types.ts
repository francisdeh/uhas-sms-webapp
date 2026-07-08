export type AppointmentStatus = "pending" | "confirmed" | "declined" | "cancelled";
export type AppointmentSlot = "snack" | "lunch" | "after_school";

export const SLOT_LABELS: Record<AppointmentSlot, string> = {
  snack: "Snack (10:00–10:20)",
  lunch: "Lunch (12:20–13:05)",
  after_school: "After School (15:05–15:45)",
};

export type Appointment = {
  id: string;
  schoolId: string;
  guardianId: string;
  guardianName: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  preferredDate: string;
  preferredSlot: AppointmentSlot;
  reason: string | null;
  status: AppointmentStatus;
  teacherResponse: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAppointmentInput = {
  studentId: string;
  teacherId: string;
  preferredDate: string;
  preferredSlot: AppointmentSlot;
  reason?: string;
};

export type RespondToAppointmentInput = {
  decision: "confirm" | "decline";
  response?: string;
};
