// Canonical return type for every Server Action.
//
// Every action returns one of two shapes:
//   { success: true; ...data }    — caller can branch and read data fields
//   { success: false; error: string } — caller shows the error (toast, etc.)
//
// Never throw from a server action; catch internally and return the
// failure shape. Throwing crashes the route and falls through to the
// closest error.tsx boundary — that's correct for unexpected errors
// (programming bugs, DB down) but wrong for expected business errors
// like "not found" or "not allowed". For those, return `{ success:
// false, error }` so the UI can render a toast inline.
//
// Usage:
//
//   // No data on success
//   export async function deactivateUserAction(uid: string): Promise<ActionResult> {
//     ...
//     return { success: true };
//   }
//
//   // With data on success (use intersection with a data shape)
//   export async function createUserAction(input: …): Promise<ActionResult<{ uid: string }>> {
//     ...
//     return { success: true, uid: created.uid };
//   }
//
//   // With multiple fields
//   Promise<ActionResult<{ sessionId: string; recordCount: number }>>
//
// Why intersection instead of a `data: T` wrapper? Existing call sites
// destructure directly: `if (result.success) router.push(result.redirect)`.
// Keeping the data inline preserves that ergonomic pattern.

export type ActionResult<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };
