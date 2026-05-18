"use server";

import { mockAnnouncements } from "@/lib/mock/announcements";
import { mockStaff } from "@/lib/mock/staff";
import { mockStudents } from "@/lib/mock/students";
import { mockStudentGuardians } from "@/lib/mock/student-guardians";
import type {
  Announcement,
  CreateAnnouncementInput,
} from "@/features/announcements/types";
import { parseAudience } from "@/features/announcements/types";

type ActionResult = { success: true } | { success: false; error: string };

const announcements = mockAnnouncements;

export async function listAnnouncementsAction(): Promise<Announcement[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  return [...announcements].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAnnouncementsForDeputyAction(
  deputyId: string
): Promise<Announcement[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  const deputy = mockStaff.find((s) => s.id === deputyId);
  if (!deputy || deputy.systemRole !== "DeputyHead" || !deputy.division) return [];

  return [...announcements]
    .filter((a) => {
      const p = parseAudience(a.audience);
      if (p.kind === "all") return true;
      if (p.kind === "division") return p.division === deputy.division;
      return false;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAnnouncementsForTeacherAction(
  teacherId: string
): Promise<Announcement[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  const teacher = mockStaff.find((s) => s.id === teacherId);
  if (!teacher) return [];

  return [...announcements]
    .filter((a) => {
      const p = parseAudience(a.audience);
      if (p.kind === "all") return true;
      if (p.kind === "division") return teacher.division === p.division;
      // class:<id> announcements are visible to all teachers (a teacher may
      // teach a subject in a class even if they're not the class teacher).
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAnnouncementsForGuardianAction(
  guardianId: string
): Promise<Announcement[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];

  const childIds = mockStudentGuardians[guardianId] ?? [];
  const children = mockStudents.filter((s) => childIds.includes(s.id));
  const childDivisions = new Set(children.map((c) => c.division));
  const childClassIds = new Set(children.map((c) => c.classId));

  return [...announcements]
    .filter((a) => {
      const p = parseAudience(a.audience);
      if (p.kind === "all") return true;
      if (p.kind === "division") return childDivisions.has(p.division);
      if (p.kind === "class") return childClassIds.has(p.classId);
      return false;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createAnnouncementAction(input: {
  authorId: string;
  data: CreateAnnouncementInput;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };

  const author = mockStaff.find((s) => s.id === input.authorId);
  if (!author) return { success: false, error: "Author not found." };

  // Authorize audience by role
  const parsed = parseAudience(input.data.audience);
  if (parsed.kind === "all" && author.systemRole !== "Admin") {
    return { success: false, error: "Only Admin can post school-wide announcements." };
  }
  if (parsed.kind === "division") {
    if (author.systemRole === "Admin") {
      // OK
    } else if (author.systemRole === "DeputyHead") {
      if (author.division !== parsed.division) {
        return { success: false, error: "You can only post to your own division." };
      }
    } else {
      return { success: false, error: "You are not allowed to post division announcements." };
    }
  }
  if (parsed.kind === "class" && author.systemRole !== "Admin") {
    return { success: false, error: "Only Admin can target a specific class." };
  }

  const id = `ann-${Date.now()}`;
  announcements.push({
    id,
    schoolId: "school-uhas-001",
    title: input.data.title,
    body: input.data.body,
    audience: input.data.audience,
    isCritical: input.data.isCritical,
    createdById: author.id,
    createdByName: `${author.firstName} ${author.lastName}`,
    createdAt: new Date().toISOString(),
  });
  return { success: true, id };
}

export async function deleteAnnouncementAction(input: {
  id: string;
  authorId: string;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };
  const idx = announcements.findIndex((a) => a.id === input.id);
  if (idx === -1) return { success: false, error: "Announcement not found." };

  const author = mockStaff.find((s) => s.id === input.authorId);
  if (!author) return { success: false, error: "Author not found." };

  const isOwner = announcements[idx].createdById === input.authorId;
  if (!isOwner && author.systemRole !== "Admin") {
    return { success: false, error: "You can only delete your own announcements." };
  }
  announcements.splice(idx, 1);
  return { success: true };
}
