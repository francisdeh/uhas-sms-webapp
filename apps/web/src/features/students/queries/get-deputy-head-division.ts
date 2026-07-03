import { getApi } from "@/lib/api/server";
import type { Division } from "@/features/auth/types";

export async function getDeputyHeadDivision(
  linkedId: string | undefined,
): Promise<Division | undefined> {
  if (!linkedId) return undefined;
  const api = await getApi();
  try {
    const staff = await api.staff.get(linkedId);
    const d = staff.division;
    if (d === "KG" || d === "Lower Primary" || d === "Upper Primary" || d === "JHS") return d;
  } catch {
    return undefined;
  }
  return undefined;
}
