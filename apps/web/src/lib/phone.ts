// Mirrors apps/api/app/core/phone.py's normalize_ghana_phone exactly —
// used by the Profile phone-change flow so the OTP request and the
// eventual stored value agree on the same canonical form. Distinct
// from LoginForm.tsx's `normalizePhone`, which accepts any country's
// E.164 number for login identification, not just Ghana.

const LOCAL = /^0(\d{9})$/;
const INTL_NO_PLUS = /^233(\d{9})$/;
const INTL = /^\+233(\d{9})$/;

/**
 * `0244000111` / `233244000111` / `+233244000111` -> `+233244000111`.
 * Returns `null` for anything that doesn't match one of those shapes.
 */
export function normalizeGhanaPhone(raw: string): string | null {
  const candidate = raw.trim().replace(/[\s-]/g, "");
  for (const pattern of [INTL, INTL_NO_PLUS, LOCAL]) {
    const match = pattern.exec(candidate);
    if (match) return `+233${match[1]}`;
  }
  return null;
}
