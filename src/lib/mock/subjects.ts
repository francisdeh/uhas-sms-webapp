import type { Subject } from "@/features/classes/types";

export const mockSubjects: Subject[] = [
  // KG
  { id: "sub-kg-001", schoolId: "school-uhas-001", name: "Language & Literacy", division: "KG", category: "Core" },
  { id: "sub-kg-002", schoolId: "school-uhas-001", name: "Numeracy", division: "KG", category: "Core" },
  { id: "sub-kg-003", schoolId: "school-uhas-001", name: "Creative Arts & Design", division: "KG", category: "Core" },
  { id: "sub-kg-004", schoolId: "school-uhas-001", name: "Our World & Environmental Studies", division: "KG", category: "Core" },
  // Lower Primary
  { id: "sub-lpri-001", schoolId: "school-uhas-001", name: "English Language", division: "Lower Primary", category: "Core" },
  { id: "sub-lpri-002", schoolId: "school-uhas-001", name: "Mathematics", division: "Lower Primary", category: "Core" },
  { id: "sub-lpri-003", schoolId: "school-uhas-001", name: "Integrated Science", division: "Lower Primary", category: "Core" },
  { id: "sub-lpri-004", schoolId: "school-uhas-001", name: "Social Studies", division: "Lower Primary", category: "Core" },
  { id: "sub-lpri-005", schoolId: "school-uhas-001", name: "Ghanaian Language", division: "Lower Primary", category: "Core" },
  { id: "sub-lpri-006", schoolId: "school-uhas-001", name: "Creative Arts & Design", division: "Lower Primary", category: "Elective" },
  { id: "sub-lpri-007", schoolId: "school-uhas-001", name: "Religious & Moral Education", division: "Lower Primary", category: "Elective" },
  // Upper Primary
  { id: "sub-upri-001", schoolId: "school-uhas-001", name: "English Language", division: "Upper Primary", category: "Core" },
  { id: "sub-upri-002", schoolId: "school-uhas-001", name: "Mathematics", division: "Upper Primary", category: "Core" },
  { id: "sub-upri-003", schoolId: "school-uhas-001", name: "Integrated Science", division: "Upper Primary", category: "Core" },
  { id: "sub-upri-004", schoolId: "school-uhas-001", name: "Social Studies", division: "Upper Primary", category: "Core" },
  { id: "sub-upri-005", schoolId: "school-uhas-001", name: "Ghanaian Language", division: "Upper Primary", category: "Elective" },
  { id: "sub-upri-006", schoolId: "school-uhas-001", name: "Creative Arts & Design", division: "Upper Primary", category: "Elective" },
  { id: "sub-upri-007", schoolId: "school-uhas-001", name: "Religious & Moral Education", division: "Upper Primary", category: "Elective" },
  { id: "sub-upri-008", schoolId: "school-uhas-001", name: "Computing", division: "Upper Primary", category: "Elective" },
  { id: "sub-upri-009", schoolId: "school-uhas-001", name: "French", division: "Upper Primary", category: "Elective" },
  // JHS
  { id: "sub-jhs-001", schoolId: "school-uhas-001", name: "English Language", division: "JHS", category: "Core" },
  { id: "sub-jhs-002", schoolId: "school-uhas-001", name: "Mathematics", division: "JHS", category: "Core" },
  { id: "sub-jhs-003", schoolId: "school-uhas-001", name: "Integrated Science", division: "JHS", category: "Core" },
  { id: "sub-jhs-004", schoolId: "school-uhas-001", name: "Social Studies", division: "JHS", category: "Core" },
  { id: "sub-jhs-005", schoolId: "school-uhas-001", name: "Computing", division: "JHS", category: "Elective" },
  { id: "sub-jhs-006", schoolId: "school-uhas-001", name: "French", division: "JHS", category: "Elective" },
  { id: "sub-jhs-007", schoolId: "school-uhas-001", name: "Ghanaian Language", division: "JHS", category: "Elective" },
  { id: "sub-jhs-008", schoolId: "school-uhas-001", name: "Career Technology", division: "JHS", category: "Elective" },
  { id: "sub-jhs-009", schoolId: "school-uhas-001", name: "Religious & Moral Education", division: "JHS", category: "Elective" },
  // Cross-division
  { id: "sub-all-001", schoolId: "school-uhas-001", name: "Physical Education", division: null, category: "Elective" },
];
