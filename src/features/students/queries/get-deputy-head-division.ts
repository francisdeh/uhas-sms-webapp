import { mockStaff } from "@/lib/mock/staff";
import type { Division } from "@/features/auth/types";

export async function getDeputyHeadDivision(
  linkedId: string | undefined
): Promise<Division | undefined> {
  if (!linkedId) return undefined;
  if (process.env.USE_MOCK_DATA === "true") {
    const staff = mockStaff.find((s) => s.id === linkedId);
    const d = staff?.division;
    if (d === "KG" || d === "Lower Primary" || d === "Upper Primary" || d === "JHS") return d;
    return undefined;
  }
  return undefined;
}
