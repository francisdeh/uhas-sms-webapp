import type { Page } from "@playwright/test";

// Wait for React 18 to finish hydrating the form on the current page.
// Without this, a click on a submit button can race the onSubmit binding
// and the browser falls back to a plain GET. React attaches
// __reactProps$<id> to managed DOM nodes — its presence on <form> is a
// reliable signal that handlers are wired.
export async function waitForFormHydration(page: Page) {
  // Strict: EVERY <form> on the page must have React-bound props. A page
  // can have multiple forms (global search + the feature form); the
  // permissive "any form is hydrated" check passes too early in Next.js
  // dev mode when the lighter form hydrates first.
  await page.waitForFunction(
    () => {
      const forms = Array.from(document.querySelectorAll("form"));
      return (
        forms.length > 0 &&
        forms.every((f) => Object.keys(f).some((k) => k.startsWith("__reactProps")))
      );
    },
    undefined,
    { timeout: 15_000 }
  );
}
