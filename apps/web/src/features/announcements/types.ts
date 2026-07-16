import type { Division } from "@/features/auth/types";

// Audience format:
//   "all"                     → whole school
//   "all:staff"               → whole school, staff only (no parents)
//   "division:KG" etc.        → one division
//   "division:KG:staff" etc.  → one division, staff only
//   "class:<classId>"         → one specific class (parents only —
//                               there's no staff variant; class-scoped
//                               staff comms go through assignments +
//                               attendance instead)
export type AnnouncementAudience = string;

export const ALL_AUDIENCE = "all" as const;
const DIVISION_AUDIENCE_PREFIX = "division:";
const CLASS_AUDIENCE_PREFIX = "class:";
const STAFF_SUFFIX = ":staff";

export function divisionAudience(
  division: Division,
  options?: { staffOnly?: boolean }
): AnnouncementAudience {
  const suffix = options?.staffOnly ? STAFF_SUFFIX : "";
  return `${DIVISION_AUDIENCE_PREFIX}${division}${suffix}`;
}

export function staffAllAudience(): AnnouncementAudience {
  return `${ALL_AUDIENCE}${STAFF_SUFFIX}`;
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
  | { kind: "all"; staffOnly: boolean }
  | { kind: "division"; division: Division; staffOnly: boolean }
  | { kind: "class"; classId: string } {
  if (audience === ALL_AUDIENCE) return { kind: "all", staffOnly: false };
  if (audience === staffAllAudience()) return { kind: "all", staffOnly: true };
  if (audience.startsWith(DIVISION_AUDIENCE_PREFIX)) {
    const rest = audience.slice(DIVISION_AUDIENCE_PREFIX.length);
    if (rest.endsWith(STAFF_SUFFIX)) {
      return {
        kind: "division",
        division: rest.slice(0, -STAFF_SUFFIX.length) as Division,
        staffOnly: true,
      };
    }
    return { kind: "division", division: rest as Division, staffOnly: false };
  }
  if (audience.startsWith(CLASS_AUDIENCE_PREFIX))
    return { kind: "class", classId: audience.slice(CLASS_AUDIENCE_PREFIX.length) };
  return { kind: "all", staffOnly: false };
}

export function audienceLabel(audience: AnnouncementAudience, classes?: { id: string; name: string }[]): string {
  const parsed = parseAudience(audience);
  if (parsed.kind === "all") return parsed.staffOnly ? "All school (staff only)" : "All school";
  if (parsed.kind === "division")
    return parsed.staffOnly ? `${parsed.division} (staff only)` : parsed.division;
  const c = classes?.find((x) => x.id === parsed.classId);
  return c ? c.name : "Class";
}
