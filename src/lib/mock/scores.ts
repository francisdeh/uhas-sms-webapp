export type MockScore = {
  id: string;
  examId: string;
  studentId: string;
  subjectId: string;
  classScore: number | null;
  examScore: number;
  totalScore: number;
  grade: string;
  interpretation: string;
  subjectPosition: number;
};

export const GES_GRADES: { min: number; max: number; grade: string; interpretation: string }[] = [
  { min: 80, max: 100, grade: "1", interpretation: "Excellent" },
  { min: 70, max: 79,  grade: "2", interpretation: "Very Good" },
  { min: 60, max: 69,  grade: "3", interpretation: "Good" },
  { min: 55, max: 59,  grade: "4", interpretation: "Credit" },
  { min: 50, max: 54,  grade: "5", interpretation: "Credit" },
  { min: 45, max: 49,  grade: "6", interpretation: "Pass" },
  { min: 40, max: 44,  grade: "7", interpretation: "Pass" },
  { min: 35, max: 39,  grade: "8", interpretation: "Fail" },
  { min: 0,  max: 34,  grade: "9", interpretation: "Fail" },
];

export function computeGrade(total: number) {
  return GES_GRADES.find((g) => total >= g.min && total <= g.max) ?? GES_GRADES[GES_GRADES.length - 1];
}

export const mockScores: MockScore[] = [
  { id: "score-001", examId: "exam-midterm1", studentId: "UHAS-2026-0001", subjectId: "subj-math", classScore: 28, examScore: 55, totalScore: 83, grade: "1", interpretation: "Excellent", subjectPosition: 1 },
  { id: "score-002", examId: "exam-midterm1", studentId: "UHAS-2026-0002", subjectId: "subj-math", classScore: 22, examScore: 45, totalScore: 67, grade: "3", interpretation: "Good", subjectPosition: 2 },
  { id: "score-003", examId: "exam-midterm1", studentId: "UHAS-2026-0001", subjectId: "subj-english", classScore: 25, examScore: 50, totalScore: 75, grade: "2", interpretation: "Very Good", subjectPosition: 1 },
  { id: "score-004", examId: "exam-midterm1", studentId: "UHAS-2026-0002", subjectId: "subj-english", classScore: 20, examScore: 40, totalScore: 60, grade: "3", interpretation: "Good", subjectPosition: 2 },
];
