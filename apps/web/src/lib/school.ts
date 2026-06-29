// Single-school MVP. Routed through a helper so per-session school resolution
// can replace this without touching every call site.
const DEFAULT_SCHOOL_ID = "school-uhas-001";

export async function getCurrentSchoolId(): Promise<string> {
  return DEFAULT_SCHOOL_ID;
}
