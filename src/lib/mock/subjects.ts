import type { Subject } from "@/features/classes/types";

export const mockSubjects: Subject[] = [
  // KG
  { id: "sub-kg-001", schoolId: "school-uhas-001", name: "Language & Literacy", division: "KG", category: "Core" },
  { id: "sub-kg-002", schoolId: "school-uhas-001", name: "Numeracy", division: "KG", category: "Core" },
  { id: "sub-kg-003", schoolId: "school-uhas-001", name: "Creative Arts & Design", division: "KG", category: "Core" },
  { id: "sub-kg-004", schoolId: "school-uhas-001", name: "Our World & Environmental Studies", division: "KG", category: "Core" },
  // Primary
  { id: "sub-pri-001", schoolId: "school-uhas-001", name: "English Language", division: "Primary", category: "Core" },
  { id: "sub-pri-002", schoolId: "school-uhas-001", name: "Mathematics", division: "Primary", category: "Core" },
  { id: "sub-pri-003", schoolId: "school-uhas-001", name: "Integrated Science", division: "Primary", category: "Core" },
  { id: "sub-pri-004", schoolId: "school-uhas-001", name: "Social Studies", division: "Primary", category: "Core" },
  { id: "sub-pri-005", schoolId: "school-uhas-001", name: "Ghanaian Language", division: "Primary", category: "Core" },
  { id: "sub-pri-006", schoolId: "school-uhas-001", name: "Creative Arts & Design", division: "Primary", category: "Core" },
  { id: "sub-pri-007", schoolId: "school-uhas-001", name: "Religious & Moral Education", division: "Primary", category: "Core" },
  { id: "sub-pri-008", schoolId: "school-uhas-001", name: "ICT", division: "Primary", category: "Elective" },
  // JHS
  { id: "sub-jhs-001", schoolId: "school-uhas-001", name: "English Language", division: "JHS", category: "Core" },
  { id: "sub-jhs-002", schoolId: "school-uhas-001", name: "Mathematics", division: "JHS", category: "Core" },
  { id: "sub-jhs-003", schoolId: "school-uhas-001", name: "Integrated Science", division: "JHS", category: "Core" },
  { id: "sub-jhs-004", schoolId: "school-uhas-001", name: "Social Studies", division: "JHS", category: "Core" },
  { id: "sub-jhs-005", schoolId: "school-uhas-001", name: "ICT", division: "JHS", category: "Core" },
  { id: "sub-jhs-006", schoolId: "school-uhas-001", name: "French", division: "JHS", category: "Elective" },
  { id: "sub-jhs-007", schoolId: "school-uhas-001", name: "Ghanaian Language", division: "JHS", category: "Core" },
  { id: "sub-jhs-008", schoolId: "school-uhas-001", name: "Career Technology", division: "JHS", category: "Core" },
  { id: "sub-jhs-009", schoolId: "school-uhas-001", name: "Religious & Moral Education", division: "JHS", category: "Core" },
  // Cross-division
  { id: "sub-all-001", schoolId: "school-uhas-001", name: "Physical Education", division: null, category: "Core" },
];
