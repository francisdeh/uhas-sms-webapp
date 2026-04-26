import { mockStaff } from "@/lib/mock/staff";

type Division = "KG" | "Primary" | "JHS";

export async function getDeputyHeadDivision(
  linkedId: string | undefined
): Promise<Division | undefined> {
  if (!linkedId) return undefined;
  if (process.env.USE_MOCK_DATA === "true") {
    const staff = mockStaff.find((s) => s.id === linkedId);
    const d = staff?.division;
    if (d === "KG" || d === "Primary" || d === "JHS") return d;
    return undefined;
  }
  return undefined;
}
