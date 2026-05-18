import type { Division } from "@/features/auth/types";

// Audience format:
//   "all"               → whole school
//   "division:KG" etc.  → one division
//   "class:<classId>"   → one specific class
export type AnnouncementAudience = string;

export type Announcement = {
  id: string;
  schoolId: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  isCritical: boolean;
  createdById: string;
  createdByName: string;
  createdAt: string;
};

export type CreateAnnouncementInput = {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  isCritical: boolean;
};

export function parseAudience(audience: AnnouncementAudience):
  | { kind: "all" }
  | { kind: "division"; division: Division }
  | { kind: "class"; classId: string } {
  if (audience === "all") return { kind: "all" };
  if (audience.startsWith("division:"))
    return { kind: "division", division: audience.slice("division:".length) as Division };
  if (audience.startsWith("class:")) return { kind: "class", classId: audience.slice("class:".length) };
  return { kind: "all" };
}

export function audienceLabel(audience: AnnouncementAudience, classes?: { id: string; name: string }[]): string {
  const parsed = parseAudience(audience);
  if (parsed.kind === "all") return "All school";
  if (parsed.kind === "division") return parsed.division;
  const c = classes?.find((x) => x.id === parsed.classId);
  return c ? c.name : "Class";
}
