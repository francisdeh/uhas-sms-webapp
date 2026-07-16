// Shared by LoginForm (phone+OTP sign-in) and ResetPasswordForm
// (phone+OTP password recovery) — same identifier-detection and E.164
// normalization rules, so a number that logs in also resets a password.

// E.164: leading `+`, 1-9 country code, total digits 7-15.
export const E164_REGEX = /^\+[1-9]\d{6,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Ghana default — covers local 0XX-XXX-XXXX entries that aren't E.164.
// Configurable later when other countries enroll.
const DEFAULT_COUNTRY_CODE = "233";

export type IdentifierKind = "email" | "phone" | "unknown";

/**
 * Normalise the user's input into E.164.
 *
 *   "+233200000001"         → "+233200000001"
 *   "0200000001"            → "+233200000001"  (Ghana local → drop 0, add +233)
 *   "00233 200 000 001"     → "+233200000001"  (00 prefix is intl-out)
 *   "233200000001"          → "+233200000001"  (missing the +)
 *   "+1 (555) 123-4567"     → "+15551234567"   (foreign with formatting)
 *
 * Returns empty string for clearly-non-phone input (e.g. contains `@`).
 */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes("@")) return "";

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D+/g, "");
  if (!digits) return "";

  if (hasPlus) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0")) return `+${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  return `+${digits}`;
}

export function classifyIdentifier(input: string): IdentifierKind {
  const v = input.trim();
  if (!v) return "unknown";
  if (EMAIL_REGEX.test(v)) return "email";
  // Anything that looks like a phone-in-progress — leading `+`, leading `0`,
  // or all-digits-with-formatting — switches the form into phone mode.
  // Strict E.164 validation runs at submit.
  if (/^\+/.test(v)) return "phone";
  if (/^[\d\s()+\-.]+$/.test(v) && /\d/.test(v)) return "phone";
  return "unknown";
}

/**
 * In production, signInWithOtp triggers an SMS send via the configured
 * provider. Locally, the Twilio block has env-substituted (empty) creds
 * and Supabase returns "Unsupported phone provider" — but test_otp still
 * lets verifyOtp succeed with a pinned code. We treat that specific
 * error as expected in non-prod so dev/test flows still work.
 */
export function isLocalNoProviderError(message: string): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return /unsupported phone provider|no sms provider/i.test(message);
}
