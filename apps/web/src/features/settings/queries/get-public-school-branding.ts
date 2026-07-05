import "server-only";
import { cache } from "react";

import { getApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/client";

export type SchoolBranding = {
  name: string;
  motto: string | null;
  logoUrl: string | null;
};

const FALLBACK: SchoolBranding = { name: "UHAS Basic School", motto: null, logoUrl: null };

/**
 * Cosmetic-only school info for pre-auth pages (login) — calls the one
 * unauthenticated endpoint in the API, `GET /school/public`. Falls back
 * to a generic name rather than throwing, since a misconfigured/empty
 * DB shouldn't take down the login page itself.
 */
export const getPublicSchoolBranding = cache(async (): Promise<SchoolBranding> => {
  try {
    const api = await getApi();
    const school = await api.school.getPublic();
    return { name: school.name, motto: school.motto ?? null, logoUrl: school.logoUrl ?? null };
  } catch (err) {
    if (err instanceof ApiError) return FALLBACK;
    throw err;
  }
});
