import { format, parseISO } from "date-fns";

// Centralised date/time helpers. Use these instead of:
//   - new Date(`${date}T00:00:00`).toLocaleDateString(...)  ← timezone-fragile
//   - ad-hoc format strings scattered across components
//   - manual string concat for YYYY-MM-DD
//
// Date model conventions:
//   - Date-only values (DoB, exam date, term dates, attendance date,
//     leave start/end): stored + passed around as `YYYY-MM-DD` strings.
//   - Timestamps (createdAt, reviewedAt, etc.): stored as Date / ISO 8601.
//   - All display in the school's local sense — date-fns parses
//     `YYYY-MM-DD` as local midnight, which is what we want for dates that
//     don't have an inherent timezone.
//
// Format tokens are date-fns syntax, not Intl's. Cheat sheet:
//   d        day of month (1, 2, … 31)
//   dd       2-digit day (01, 02, …)
//   MMM      Jan, Feb, …
//   MMMM     January, February, …
//   yyyy     2026
//   EEEE     Monday, Tuesday, …
//   h:mm a   1:30 PM

/** Parse a `YYYY-MM-DD` string (or Date / ISO timestamp) into a Date. */
function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  return parseISO(value);
}

/** "5 May 2026" — default short form for most lists / cards. */
export function formatDate(value: string | Date, fmt: string = "d MMM yyyy"): string {
  return format(toDate(value), fmt);
}

/** "Monday, 5 May 2026" — full weekday name; matches the dominant codebase pattern. */
export function formatDateLong(value: string | Date): string {
  return format(toDate(value), "EEEE, d MMM yyyy");
}

/** "Mon, 5 May 2026" — abbreviated weekday for compact rows. */
export function formatDateWithWeekday(value: string | Date): string {
  return format(toDate(value), "EEE, d MMM yyyy");
}

/** "5 May 2026, 1:30 PM" — for activity logs + timestamps. */
export function formatDateTime(value: string | Date): string {
  return format(toDate(value), "d MMM yyyy, h:mm a");
}

/** "05/05/2026" — for compact tables / forms with `type="date"` defaults. */
export function formatDateShort(value: string | Date): string {
  return format(toDate(value), "dd/MM/yyyy");
}

/** Today's date as `YYYY-MM-DD` (local). Use as default value for date inputs. */
export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** Days between two `YYYY-MM-DD` strings (or Dates). Positive when `end > start`. */
export function daysBetween(start: string | Date, end: string | Date): number {
  const s = toDate(start);
  const e = toDate(end);
  return Math.round((e.getTime() - s.getTime()) / 86_400_000);
}
