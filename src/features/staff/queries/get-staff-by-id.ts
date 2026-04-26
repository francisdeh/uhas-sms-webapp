import { mockStaff } from "@/lib/mock/staff";
import type { Staff } from "@/features/staff/types";

export async function getStaffById(id: string): Promise<Staff | undefined> {
  if (process.env.USE_MOCK_DATA === "true") {
    return mockStaff.find((s) => s.id === id);
  }
  return undefined;
}
