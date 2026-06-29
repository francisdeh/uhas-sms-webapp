export type AssignmentStatus = "draft" | "published";

export type Assignment = {
  id: string;
  schoolId: string;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  dueDate: string;
  status: AssignmentStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAssignmentInput = {
  classId: string;
  subjectId: string;
  title: string;
  description?: string;
  fileUrl?: string;
  dueDate: string;
};

export type UpdateAssignmentInput = Partial<CreateAssignmentInput>;
