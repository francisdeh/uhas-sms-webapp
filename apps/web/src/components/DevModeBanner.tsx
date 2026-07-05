// Height is a shared constant (`DEV_BANNER_HEIGHT_CLASS` / `_REM`) because
// `(dashboard)`'s shell uses a hard `h-screen` — when this banner renders
// above it, the shell has to shrink by exactly this much or its bottom
// edge clips below the viewport. See DashboardLayout.tsx.
export const DEV_BANNER_HEIGHT_CLASS = "h-7";
export const DEV_BANNER_HEIGHT_REM = "1.75rem"; // h-7 = 28px = 1.75rem

export function isDevMode(): boolean {
  return process.env.NODE_ENV === "development";
}

export function DevModeBanner() {
  return (
    <div
      className={`${DEV_BANNER_HEIGHT_CLASS} flex-shrink-0 flex items-center justify-center gap-2 bg-amber-400 text-amber-950 text-xs font-semibold tracking-wide`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-950/70 animate-pulse" />
      DEVELOPMENT MODE — not production data
    </div>
  );
}
