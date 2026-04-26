import type { SchoolClass } from "@/features/classes/types";

export const mockClasses: SchoolClass[] = [
  // KG
  { id: "class-kg1", schoolId: "school-uhas-001", name: "KG 1", division: "KG", academicYear: "2025/2026", classTeacherId: null, classTeacherName: null },
  { id: "class-kg2", schoolId: "school-uhas-001", name: "KG 2", division: "KG", academicYear: "2025/2026", classTeacherId: null, classTeacherName: null },
  // Primary
  { id: "class-p1", schoolId: "school-uhas-001", name: "Primary 1", division: "Primary", academicYear: "2025/2026", classTeacherId: null, classTeacherName: null },
  { id: "class-p2", schoolId: "school-uhas-001", name: "Primary 2", division: "Primary", academicYear: "2025/2026", classTeacherId: null, classTeacherName: null },
  { id: "class-p3", schoolId: "school-uhas-001", name: "Primary 3", division: "Primary", academicYear: "2025/2026", classTeacherId: null, classTeacherName: null },
  { id: "class-p4", schoolId: "school-uhas-001", name: "Primary 4", division: "Primary", academicYear: "2025/2026", classTeacherId: "STAFF-006", classTeacherName: "Gifty Acheampong" },
  { id: "class-p5", schoolId: "school-uhas-001", name: "Primary 5", division: "Primary", academicYear: "2025/2026", classTeacherId: "STAFF-006", classTeacherName: "Gifty Acheampong" },
  { id: "class-p6", schoolId: "school-uhas-001", name: "Primary 6", division: "Primary", academicYear: "2025/2026", classTeacherId: null, classTeacherName: null },
  // JHS
  { id: "class-jhs1a", schoolId: "school-uhas-001", name: "JHS 1A", division: "JHS", academicYear: "2025/2026", classTeacherId: "STAFF-005", classTeacherName: "Kwame Darko" },
  { id: "class-jhs2a", schoolId: "school-uhas-001", name: "JHS 2A", division: "JHS", academicYear: "2025/2026", classTeacherId: "STAFF-005", classTeacherName: "Kwame Darko" },
  { id: "class-jhs3a", schoolId: "school-uhas-001", name: "JHS 3A", division: "JHS", academicYear: "2025/2026", classTeacherId: null, classTeacherName: null },
];
