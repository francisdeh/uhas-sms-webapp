// Single-school MVP. Routed through a helper so per-session school resolution
// can replace this without touching every call site.
//
// Returns the UUID of the seeded school — derived via det() from the
// historical slug "school-uhas-001". Slug is preserved as the seed key so
// audit-log entries from before this PR (and FastAPI JWT claims minted
// in tests) keep resolving to the same UUID.

import { det } from "@/lib/uuid";

const SCHOOL_UUID = det("school-uhas-001");

export async function getCurrentSchoolId(): Promise<string> {
  return SCHOOL_UUID;
}
