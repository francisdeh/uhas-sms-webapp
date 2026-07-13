# Action-button + page-layout consistency pass — design

A pragmatic consistency fix, not a redesign — a full UI revamp is planned as separate future work. This pass: (1) one named primary-CTA button variant used app-wide, (2) one named destructive-confirm variant replacing a copy-pasted override, (3) the leave-requests page's structural mismatch with every other admin list page, (4) the audit-log filter row's cramped layout.

## Pre-design audit — ground truth

- `apps/web/src/components/ui/button.tsx`'s `buttonVariants` has no brand/CTA variant. Every primary "add/create" button either: hand-rolls a raw `<Link>` styled `bg-slate-800` (Classes, Staff, Students headers — also violating CLAUDE.md's "shadcn-only, no raw HTML" rule), uses the `ink` variant (also slate-800, Users), uses plain `variant="default"` (`bg-primary`, near-black — Announcements, Examinations, Fee Items), or hand-rolls `bg-accent-orange` (Login, `ClassCreateForm`'s submit button, the staff-registration success dialog's "Done"). Two flows visibly flip color mid-journey: Classes' header button (slate-800) → `ClassCreateForm`'s own submit button (brand green) one click later; Staff's header button (slate-800) → its own submit button (slate-800, consistent) → the immediately-following success dialog's "Done" (brand green).
- `bg-accent-orange` resolves to UHAS's actual brand green (`#1B6B3E`) via the `:root[data-color-scheme="uhas"]` theme override — not literal orange. `bg-slate-800` is a hardcoded Tailwind grey, invisible to theme switching.
- Destructive confirm buttons: ~15 files already hand-apply the identical override `className="bg-destructive text-white hover:bg-destructive/90"` on `AlertDialogAction` — a de-facto standard, just never extracted into a variant. Two *trigger* buttons (`ProfilePage.tsx`, `StaffDetail.tsx`, both "Deactivate") use `variant="destructive"` directly, which resolves to a soft/pale red — different from the solid-red confirm buttons they open, but this is a defensible escalating-emphasis pattern (soft entry point → solid point-of-no-return), not addressed here.
- Leave-requests page (`admin/leave/page.tsx` + `LeaveRequestList.tsx`) is the only admin list page wrapped in `max-w-3xl mx-auto` — every other list page (Staff/Classes/Students) returns `space-y-5` with no width constraint, relying on the shared dashboard shell for spacing. It also renders its own header (title + pending-count badge) *inside* `LeaveRequestList.tsx`, separately from the page's own `<h1>` + subtitle — two header blocks stacked, neither matching the app's single `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3` title+action convention.
- Audit-log's filter row (`AuditLogFilters.tsx`) packs 3 selects + 2 date inputs + 2 buttons into one `flex ... gap-2` row with no `flex-wrap` — StaffTable's equivalent filter row uses `flex flex-wrap items-center gap-4` (wrapping enabled, double the gap), which is why it doesn't look cramped.

## Scope (decided)

- **Primary CTA color: brand green** (`bg-accent-orange` token, i.e. UHAS's actual brand color) — extends what Login/ClassCreateForm/the staff-invite success dialog already do, to every primary "add/create" button app-wide.
- **Destructive confirm**: extract the existing 15-file copy-pasted override into a named variant — a refactor, no visual change. The two soft-red trigger buttons stay as-is (reasonable escalating-emphasis pattern, not a bug).
- **Dialog "no explicit Cancel" cases** (Subjects add dialog, staff-success dialog, RecordPaymentDialog, EditLearnerFeeDialog, FeeItemForm): left as-is — context-dependent (a single-action success/info dialog genuinely has nothing to cancel), not blanket-fixed.
- **Leave page**: remove the narrow container, consolidate to one header matching the standard convention. The card-per-row list layout itself stays (leave requests carry multi-line content — reason, cover, balance hint, actions — that doesn't compress into a dense table row); converting it to a `DataTable` is deferred to the future full revamp.
- **Audit log**: wrap + widen the filter row's gap to match the established StaffTable pattern.

## 1. New Button variants

`apps/web/src/components/ui/button.tsx`:

```ts
brand: "bg-accent-orange text-white hover:bg-accent-orange/90 focus-visible:ring-accent-orange/40",
"destructive-solid": "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40",
```

`variant="brand"` becomes the one primary-CTA style used everywhere a page/dialog needs an "add/create/register/send" action. `variant="destructive-solid"` replaces the ~15 hand-applied `className` overrides on `AlertDialogAction` confirm buttons — same visual result, one canonical source.

The existing `ink`/`ink-outline` variants stay (used elsewhere for non-CTA purposes) but stop being used for primary CTAs specifically.

## 2. Primary-CTA sweep

Every button identified in the audit as a primary "add/create" action switches to `variant="brand"`:

- `SubjectsTable.tsx` "Add Subject" (was `outline`)
- `ClassesTable.tsx` "Add Class" — converted from a raw hand-styled `<Link>` to `<Button variant="brand" asChild><Link>` (fixes both the color and the raw-HTML violation)
- `StaffTable.tsx` "Register staff" — same raw-`<Link>`-to-`Button` conversion
- `StudentsTable.tsx` "Register student" — same conversion
- `UsersTable.tsx` "New account" (was `ink`)
- `AnnouncementsView.tsx`, `ExamsManager.tsx`, `FeeItemForm.tsx` "New …" buttons (were plain `default`)
- `ClassCreateForm.tsx`, `StaffRegistrationForm.tsx` submit buttons + the success dialog's "Done" (already `bg-accent-orange` hand-rolled — swapped to the new variant, same color, now themeable/canonical instead of an inline override)

Any other one-off "add"-style button surfaced during implementation that matches this pattern gets the same treatment — the point is one variant, zero exceptions for this specific button *class* (primary create/add actions). Filter-toggle buttons, table row actions, and secondary buttons are unaffected.

## 3. Destructive-confirm sweep

All ~15 files' `AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90"` become `<AlertDialogAction variant="destructive-solid">` with the className override removed. Pure refactor — identical rendered output, single source of truth going forward.

## 4. Leave-requests page

- `admin/leave/page.tsx`: drop `max-w-3xl mx-auto py-6 px-4`, use `space-y-5` matching Staff/Classes/Students.
- Consolidate the page's own `<h1>Leave Requests</h1>` + division subtitle and `LeaveRequestList.tsx`'s internal title+badge into one header row: `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`, title+subtitle on the left, the pending-count badge inline next to the title (no action button here — Admin/Deputy Head don't *create* leave requests, only review them).
- Filter pills and the card-list body stay as they are today.

## 5. Audit-log filter row

`AuditLogFilters.tsx`'s row wrapper changes from `flex flex-col sm:flex-row sm:items-end gap-2` to `flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-4`, matching `StaffTable.tsx`'s established filter-row pattern.

## Testing

- No new backend changes — frontend-only. Verification: `tsc --noEmit`, `pnpm lint`, `pnpm test` (existing Vitest suite, no new component-render tests per this codebase's convention), `pnpm build`.
- Manual browser check: visit every page touched (Subjects, Classes, Staff, Students, Users, Announcements, Examinations, Fee Items, admin/deputy-head/teacher Leave, Audit Log) and confirm the primary CTA renders brand green consistently, the Classes/Staff journeys no longer flip color between header and form, at least one destructive confirm dialog still renders solid red, the leave page's header/width matches other list pages, and the audit-log filter row no longer looks cramped at common viewport widths.

## Out of scope

- Full UI/visual redesign — tracked separately as future work per the user's own framing.
- Converting the leave-requests card list to a `DataTable`.
- Adding explicit Cancel buttons to the handful of dialogs that don't have one today.
- Any change to the two soft-red "Deactivate" trigger buttons.
