import type { SchoolClass } from "@/features/classes/types";

export const mockClasses: SchoolClass[] = [
  // KG
  { id: "class-kg1", schoolId: "school-uhas-001", name: "KG 1", division: "KG", academicYear: "2025/2026", classTeachers: [{ staffId: "STAFF-012", staffName: "Esther Amoah", isPrimary: true }] },
  { id: "class-kg2", schoolId: "school-uhas-001", name: "KG 2", division: "KG", academicYear: "2025/2026", classTeachers: [] },
  // Lower Primary
  { id: "class-p1", schoolId: "school-uhas-001", name: "Primary 1", division: "Lower Primary", academicYear: "2025/2026", classTeachers: [{ staffId: "STAFF-010", staffName: "Vivian Quartey", isPrimary: true }] },
  { id: "class-p2", schoolId: "school-uhas-001", name: "Primary 2", division: "Lower Primary", academicYear: "2025/2026", classTeachers: [] },
  { id: "class-p3", schoolId: "school-uhas-001", name: "Primary 3", division: "Lower Primary", academicYear: "2025/2026", classTeachers: [] },
  // Upper Primary
  { id: "class-p4", schoolId: "school-uhas-001", name: "Primary 4", division: "Upper Primary", academicYear: "2025/2026", classTeachers: [{ staffId: "STAFF-006", staffName: "Gifty Acheampong", isPrimary: true }] },
  { id: "class-p5", schoolId: "school-uhas-001", name: "Primary 5", division: "Upper Primary", academicYear: "2025/2026", classTeachers: [{ staffId: "STAFF-006", staffName: "Gifty Acheampong", isPrimary: true }] },
  { id: "class-p6", schoolId: "school-uhas-001", name: "Primary 6", division: "Upper Primary", academicYear: "2025/2026", classTeachers: [] },
  // JHS
  { id: "class-jhs1a", schoolId: "school-uhas-001", name: "JHS 1A", division: "JHS", academicYear: "2025/2026", classTeachers: [{ staffId: "STAFF-005", staffName: "Kwame Darko", isPrimary: true }, { staffId: "STAFF-009", staffName: "Nana Agyeman", isPrimary: false }] },
  { id: "class-jhs2a", schoolId: "school-uhas-001", name: "JHS 2A", division: "JHS", academicYear: "2025/2026", classTeachers: [{ staffId: "STAFF-005", staffName: "Kwame Darko", isPrimary: true }] },
  { id: "class-jhs3a", schoolId: "school-uhas-001", name: "JHS 3A", division: "JHS", academicYear: "2025/2026", classTeachers: [] },
];
