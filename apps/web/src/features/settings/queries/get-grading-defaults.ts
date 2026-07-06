import "server-only";
import { cache } from "react";

import { getApi } from "@/lib/api/server";
import type { GradingDefaults } from "@/features/settings/types";

/**
 * The fixed GES-standard grading config (`GET /school/grading-defaults`)
 * — a backend constant, not this school's saved settings. Used by the
 * Settings > Grading "Reset to GES standard" control so the frontend
 * keeps no hardcoded copy of the bands/weights.
 */
export const getGradingDefaults = cache(async (): Promise<GradingDefaults> => {
  const api = await getApi();
  const defaults = await api.school.gradingDefaults();
  return {
    gradingBands: defaults.gradingBands,
    scoreWeights: defaults.scoreWeights,
    passMark: defaults.passMark,
  };
});
