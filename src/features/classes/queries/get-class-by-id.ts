import { mockClasses } from "@/lib/mock/classes";
import type { SchoolClass } from "@/features/classes/types";

export async function getClassById(id: string): Promise<SchoolClass | undefined> {
  if (process.env.USE_MOCK_DATA === "true") {
    return mockClasses.find((c) => c.id === id);
  }
  return undefined;
}
