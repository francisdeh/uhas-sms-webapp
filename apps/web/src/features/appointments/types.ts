export type AppointmentStatus = "pending" | "confirmed" | "declined" | "cancelled";
export type AppointmentSlot = "morning" | "afternoon" | "after_school";

export const SLOT_LABELS: Record<AppointmentSlot, string> = {
  morning: "Morning (before 11:00)",
  afternoon: "Afternoon (12:00–14:00)",
  after_school: "After school (15:00–17:00)",
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
