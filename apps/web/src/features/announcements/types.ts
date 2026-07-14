import type { Division } from "@/features/auth/types";

// Audience format:
//   "all"               → whole school
//   "division:KG" etc.  → one division
//   "class:<classId>"   → one specific class
export type AnnouncementAudience = string;

export const ALL_AUDIENCE = "all" as const;
const DIVISION_AUDIENCE_PREFIX = "division:";
const CLASS_AUDIENCE_PREFIX = "class:";

export function divisionAudience(division: Division): AnnouncementAudience {
  return `${DIVISION_AUDIENCE_PREFIX}${division}`;
}

export function classAudience(classId: string): AnnouncementAudience {
  return `${CLASS_AUDIENCE_PREFIX}${classId}`;
}

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
  if (audience === ALL_AUDIENCE) return { kind: "all" };
  if (audience.startsWith(DIVISION_AUDIENCE_PREFIX))
    return { kind: "division", division: audience.slice(DIVISION_AUDIENCE_PREFIX.length) as Division };
  if (audience.startsWith(CLASS_AUDIENCE_PREFIX))
    return { kind: "class", classId: audience.slice(CLASS_AUDIENCE_PREFIX.length) };
  return { kind: "all" };
}

export function audienceLabel(audience: AnnouncementAudience, classes?: { id: string; name: string }[]): string {
  const parsed = parseAudience(audience);
  if (parsed.kind === "all") return "All school";
  if (parsed.kind === "division") return parsed.division;
  const c = classes?.find((x) => x.id === parsed.classId);
  return c ? c.name : "Class";
}
