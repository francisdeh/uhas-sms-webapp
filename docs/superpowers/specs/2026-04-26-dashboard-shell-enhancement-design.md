# Dashboard Shell Enhancement — Design Spec

**Date:** 2026-04-26
**Scope:** Phase 1 dashboard shell — role-specific nav, template cleanup, DataTable pattern, academic year switcher, global search (Cmd+K), animations, profile/credentials page with MFA.

---

## 1. Goals

- Replace the generic template sidebar with role-specific navigation driven by a typed config object.
- Delete all template-era junk components that no longer belong.
- Establish a reusable TanStack Table–backed DataTable component as the standard for all data-heavy pages.
- Add an academic year context switcher in the header that scopes all downstream data queries.
- Make global search work: visible header bar + Cmd+K command palette, searching across students, staff, classes, and announcements.
- Add tasteful animations via the `motion` package (stat card counters, nav stagger, page transitions, active-item slide).
- Build a comprehensive Profile & Credentials page with MFA setup, password change, and notification preferences.

---

## 2. Architecture

**Approach:** Single shell + role config object.

All roles share identical chrome (header, sidebar structure, page wrapper). Role-specific differences — nav items, permitted widgets — live in a single typed config at `src/features/shell/role-config.ts`. The `DashboardLayout` server component reads `session_role` from the request cookies and passes the resolved config down via React context.

This means the academic year switcher, Cmd+K search, and profile menu are implemented once and work for every role.

---

## 3. File Structure

### New feature module

```
src/features/shell/
├── role-config.ts                  ← maps Role → ShellConfig (nav items, label)
├── types.ts                        ← NavItem, NavGroup, ShellConfig types
└── components/
    ├── DashboardLayout.tsx         ← server component; reads cookie, resolves config, sets context
    ├── Sidebar.tsx                 ← client component; collapsible, role nav, motion animations
    ├── Header.tsx                  ← client component; search bar, year switcher, notifications, profile
    ├── SearchCommand.tsx           ← client component; shadcn Command inside Dialog, Cmd+K
    └── AcademicYearSwitcher.tsx    ← client component; shadcn Select, persists to localStorage
```

### New profile feature

```
src/features/profile/
└── components/
    └── ProfilePage.tsx             ← client component; shadcn Tabs: Profile, Security, Notifications, Danger Zone
```

### Shared UI primitive

```
src/components/ui/data-table.tsx    ← reusable TanStack Table wrapper (columns + data props)
```

### App routes

```
src/app/(dashboard)/layout.tsx      ← imports DashboardLayout from features/shell
src/app/(dashboard)/[role]/profile/page.tsx  ← renders ProfilePage (one route, all roles)
```

### Files deleted

```
src/components/dashboard/ConversionRate.tsx
src/components/dashboard/CoursesTable.tsx
src/components/dashboard/EarningReport.tsx
src/components/dashboard/PaymentHistory.tsx
src/components/dashboard/Performance.tsx
src/components/dashboard/StatsRow.tsx
src/components/dashboard/TopServices.tsx
```

The existing `src/components/dashboard/DashboardLayout.tsx`, `Header.tsx`, and `Sidebar.tsx` are replaced by the new feature-module versions and then deleted.

---

## 4. Role Config

`src/features/shell/types.ts`:

```ts
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;        // e.g. pending lesson plan count
};

export type NavGroup = {
  groupLabel?: string;   // optional section divider label
  items: NavItem[];
};

export type ShellConfig = {
  label: string;         // human-readable role name
  navGroups: NavGroup[];
};
```

`src/features/shell/role-config.ts` defines one `ShellConfig` per role:

| Role | Nav Items |
|---|---|
| **Admin** | Overview, Students, Staff, Classes, Attendance, Examinations, Lesson Plans, Reports, Settings |
| **DeputyHead** | Overview, Classes, Attendance, Lesson Plans (badge: pending count), Reports |
| **HOD** | Overview, My Department, Lesson Plans (badge: review queue), Examinations, Reports |
| **Teacher** | Overview, My Classes, Attendance, Lesson Plans, Examinations, Reports |
| **Parent** | Overview, My Children, Attendance, Results, Announcements |

Badge counts are sourced from mock data initially; replaced with real DB queries per phase.

---

## 5. Header

Left to right:

1. **Sidebar toggle** — collapses/expands sidebar on desktop; opens shadcn `<Sheet>` on mobile.
2. **Search bar** — always visible, full width on mobile. Placeholder: `Search students, staff, classes… ⌘K`. Clicking opens `SearchCommand`. The bar itself is a button styled as an input (no actual `<input>` — the real input lives inside the Command modal).
3. **Academic Year Switcher** — shadcn `<Select>`. Options: last 3 academic years + current. Selected year stored in React context (`AcademicYearContext`) and persisted to `localStorage` key `uhas_academic_year`. All data queries consume this context.
4. **Notifications bell** — icon + badge count (mock). No dropdown for now — clicking navigates to `/[role]/notifications` (stub page).
5. **Profile avatar dropdown** — shadcn `<DropdownMenu>`: "My Profile" → `/[role]/profile`, "Change Password" → `/change-password`, divider, "Sign out" → calls logout Server Action.

---

## 6. Sidebar

**Desktop:**
- Fixed left rail: 240px expanded, 64px icon-only collapsed.
- Collapse state persisted to `localStorage` key `uhas_sidebar_collapsed`.
- Collapsed: icon only + shadcn `<Tooltip>` on each item showing the label.
- Top: school logo + "UHAS Basic School" name (hidden when collapsed).
- Bottom: user avatar + display name + role badge, links to `/[role]/profile`.

**Mobile:**
- Hidden by default. Header toggle opens a shadcn `<Sheet side="left">` containing the full sidebar content.

**Active state:**
- Current route: solid background tint + 2px orange left border.
- Uses `usePathname()` to determine active item.

**Animations (via `motion`):**
- Width transition: `motion` layout animation, spring preset, ~200ms.
- Nav items on mount: staggered `fadeIn` + `x: -8 → 0`, 30ms delay between items.
- Active indicator: `motion` `layoutId="activeNav"` so the highlight slides between nav items on navigation.

---

## 7. Page Transitions & Dashboard Animations

**Page transitions:**
Wrap route content in a `motion.div` inside `DashboardLayout` with `initial={{ opacity: 0, y: 6 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ duration: 0.18 }}`. Keyed by `usePathname()` so it triggers on every route change.

**Stat card counters:**
Stat cards on dashboard pages use `motion`'s `useMotionValue` + `useSpring` + `useTransform` to animate numeric values from 0 to their target on mount. Each card has a subtle `scale: 0.97 → 1` entrance with stagger.

**General:**
- Keep animations under 250ms. No looping or distracting effects.
- Respect `prefers-reduced-motion` via `motion`'s built-in reduced-motion support.

---

## 8. Global Search (SearchCommand)

Component: `src/features/shell/components/SearchCommand.tsx`

Uses shadcn `<CommandDialog>` (which wraps `<Command>` inside a `<Dialog>`).

**Trigger:** Clicking the header search bar, or pressing `Cmd+K` (Mac) / `Ctrl+K` (Windows/Linux). Keyboard listener attached in the component via `useEffect`.

**Empty state:** "Recent searches" section showing last 5 searches from `localStorage`.

**With input:** Live-filtered results grouped by category:
- `Students` — name, class, student ID
- `Staff` — name, role, subject
- `Classes` — class name, teacher
- `Announcements` — title, date

Each result shows an icon, primary label, and secondary detail. Keyboard: `↑↓` navigate, `Enter` navigates to the entity's detail page, `Esc` closes.

**Data source:** Mock data initially (`src/lib/mock/`). Search is client-side filtering over the mock arrays. Real search will be a debounced Server Action when DB integration is added.

---

## 9. DataTable Component

`src/components/ui/data-table.tsx`

Thin wrapper around TanStack Table v8 (`@tanstack/react-table`) with:
- Props: `columns: ColumnDef<TData>[]`, `data: TData[]`, optional `searchKey?: string` for a built-in filter input.
- Built-in: column sorting (click header), pagination (shadcn `<Button>` prev/next + page indicator), optional global filter input above the table.
- Styled with shadcn `<Table>`, `<TableHeader>`, `<TableBody>`, `<TableRow>`, `<TableHead>`, `<TableCell>`.
- Skeleton loading state: renders 5 placeholder rows using shadcn `<Skeleton>` when `isLoading` prop is true.

Usage pattern per feature:
```ts
// src/features/students/components/StudentsTable.tsx
const columns: ColumnDef<Student>[] = [...]
<DataTable columns={columns} data={students} searchKey="name" />
```

---

## 10. Profile & Credentials Page

Route: `/admin/profile`, `/teacher/profile`, etc. — one page component, rendered under each role's route group.

Component: `src/features/profile/components/ProfilePage.tsx`

Layout: shadcn `<Tabs orientation="vertical">` on desktop (left tab list, right content panel), stacked tabs on mobile.

### Tab 1 — Profile
- Avatar: circular image with "Upload photo" overlay (no actual upload in this phase — placeholder only).
- Fields: Display Name, Email (read-only), Phone Number, Language (shadcn `<Select>`: English, Twi, Ga).
- Save via Server Action. Success/error via `toast`.

### Tab 2 — Security
- **Change Password:** Current password + New password + Confirm new password. Zod validation. Server Action calls Firebase `updatePassword` via Admin SDK.
- **Multi-Factor Authentication:**
  - Status chip: "Not enabled" / "Enabled (Authenticator App)".
  - "Enable MFA" flow:
    1. Password re-confirmation step (inline form).
    2. QR code rendered via `qrcode` npm package → `<img>` tag from data URL.
    3. TOTP input (6-digit code) to verify and complete enrollment.
    4. Backup codes displayed once, with "Copy" button.
  - "Remove MFA" — confirmation dialog before revoking.
- **Active Sessions:** Mock list — device name, browser, last seen timestamp, "Revoke" button (no-op in mock phase).

### Tab 3 — Notifications
- Toggle switches (shadcn `<Switch>`):
  - Email notifications for new announcements
  - Email notifications for attendance alerts
  - In-app notification sound
- Saved to user preferences mock object. Real persistence deferred to DB phase.

### Tab 4 — Danger Zone
- "Deactivate Account" button — disabled with tooltip for Admin role. Other roles see a confirmation dialog; on confirm, sends a deactivation request Server Action (mock for now, logs to console).

---

## 11. Dependencies to Install

```bash
npm install motion @tanstack/react-table qrcode
npm install -D @types/qrcode
npx shadcn@latest add command dialog sheet tooltip select tabs switch skeleton
```

---

## 12. Out of Scope

- Real database queries for search results (mock only).
- Actual file upload for avatar (placeholder UI only).
- Real-time notification delivery.
- Timetable, fee management, payroll — explicitly deferred.
- Per-role dashboard widget customisation — dashboards are enhanced but not user-configurable.
