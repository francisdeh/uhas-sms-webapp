import { mockStaff } from "@/lib/mock/staff";
import { mockSubjects } from "@/lib/mock/subjects";
import type { Subject } from "@/features/classes/types";

export async function getHodSubject(staffId: string): Promise<Subject | null> {
  if (process.env.USE_MOCK_DATA === "true") {
    const hod = mockStaff.find((s) => s.id === staffId);
    if (!hod) return null;

    // rank format: "Subject Head - <SubjectKeyword>"
    const match = hod.rank.match(/^Subject Head - (.+)$/);
    if (!match) return null;

    const keyword = match[1].trim().toLowerCase();
    return (
      mockSubjects.find(
        (s) =>
          s.division === "JHS" &&
          s.name.toLowerCase().includes(keyword)
      ) ?? null
    );
  }
  return null;
}
