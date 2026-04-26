# Phase 2a — Student Records Design

**Date:** 2026-04-26
**Status:** Approved
**Scope:** Student list, registration form, soft-delete. All on mock data (`USE_MOCK_DATA=true`). Audit log and ID card PDF deferred to later phases.

---

## 1. Routes

| Route | Who | Purpose |
|---|---|---|
| `/admin/students` | Admin | All students across all divisions |
| `/admin/students/new` | Admin | Register a new student |
| `/admin/students/[id]` | Admin | Student detail placeholder (Phase 2b) |
| `/deputy-head/students` | Deputy Head | Students in their division only |
| `/deputy-head/students/new` | Deputy Head | Register a student in their division |
| `/deputy-head/students/[id]` | Deputy Head | Student detail placeholder (Phase 2b) |

The proxy already enforces role-based routing. No additional middleware needed.

---

## 2. File Structure

```
src/
├── app/(dashboard)/
│   ├── admin/students/
│   │   ├── page.tsx            ← Server Component, reads session, renders StudentsTable
│   │   ├── new/page.tsx        ← Server Component, renders StudentRegistrationForm
│   │   └── [id]/page.tsx       ← Placeholder for Phase 2b
│   └── deputy-head/students/
│       ├── page.tsx
│       ├── new/page.tsx
│       └── [id]/page.tsx
├── features/students/
│   ├── components/
│   │   ├── StudentsTable.tsx          ← Client Component
│   │   └── StudentRegistrationForm.tsx ← Client Component
│   ├── actions/
│   │   └── index.ts                   ← Server Actions
│   ├── queries/
│   │   └── get-students.ts            ← Server-side query
│   └── types.ts                       ← Student type
└── lib/mock/students.ts               ← Expanded to ~25 students
```

---

## 3. Data Model

```ts
// src/features/students/types.ts
export type Student = {
  id: string;            // "UHAS-2026-0001" — immutable once set
  schoolId: string;
  firstName: string;
  lastName: string;
  dob: string;           // ISO date: "2012-03-15"
  gender: "Male" | "Female";
  classId: string;
  className: string;
  division: "KG" | "Primary" | "JHS";
  phone?: string;        // parent/guardian contact
  address?: string;
  nationality?: string;
  religion?: string;
  photoUrl?: string;     // stub — upload deferred to Phase 2b
  isActive: boolean;
  createdAt: string;     // ISO datetime
};
```

**Mock data** (`src/lib/mock/students.ts`): expand to ~25 students spread across KG/Primary/JHS, mix of active and inactive, some optional fields populated for realism.

**Auto-ID generation (mock):** `UHAS-${year}-${String(nextSeq).padStart(4, "0")}` where `nextSeq = mockStudents.length + 1`. In production this will use a DB sequence.

---

## 4. Server Actions

All in `src/features/students/actions/index.ts`. When `USE_MOCK_DATA=true` all actions operate on the in-memory `mockStudents` array.

```
listStudentsAction(division?: string) → Student[]
  Returns all students, or filtered by division if provided.
  Sorted by division → className → lastName.

createStudentAction(data: CreateStudentInput)
  → { success: true; id: string }
  → { success: false; error: string }
  Generates Student ID, prepends to in-memory array, returns new ID.

deactivateStudentAction(id: string) → ActionResult
  Sets isActive = false.

reactivateStudentAction(id: string) → ActionResult
  Sets isActive = true. No confirmation required in the action.
```

**Role scoping for Deputy Head:** The page component looks up the session `linkedId` against `mockStaff` to resolve the Deputy Head's `division`, then passes it to `listStudentsAction`. Admin passes `undefined`.

---

## 5. StudentsTable Component

**Props:** `initialStudents: Student[]`, `division?: string` (used to scope the "Register student" link and hide the Division filter pill for Deputy Heads)

**Stats bar (4 cards):**
- Total Students
- Active
- Inactive
- Division count (label changes based on prop: "JHS Students", "Primary Students", etc. — or "All Divisions" for Admin)

**Filter pills:**
- Division: All / KG / Primary / JHS — hidden when `division` prop is set (Deputy Head is already scoped)
- Status: All / Active / Inactive

**DataTable columns:**

| Column | Content |
|---|---|
| Student | Avatar (initials) · Full name · Student ID (subtext) |
| Class | Class name |
| Division | Pill badge (colour-coded: KG=purple, Primary=blue, JHS=orange) |
| Date of Birth | `DD MMM YYYY` formatted |
| Status | Green dot Active / Grey dot Inactive |
| Actions | View link (→ `./students/[id]`) · Deactivate / Reactivate button |

**Deactivate flow:** clicking Deactivate opens an `AlertDialog` confirmation. Reactivate is immediate (no dialog). Same pattern as `UsersTable`.

**"Register student" button:** navigates to `./students/new`.

---

## 6. StudentRegistrationForm Component

**Props:** `division?: string` (Deputy Head — pre-filters the Class select to their division), `listHref: string` (e.g. `"/admin/students"` or `"/deputy-head/students"` — passed by the page component so the form knows where to redirect on success and cancel)

**Layout:** Single-column card. Short fields (Gender + DOB, Nationality + Religion) share a two-column grid row.

**Fields:**

| Field | Type | Required |
|---|---|---|
| First Name | Text input | Yes |
| Last Name | Text input | Yes |
| Date of Birth | Date input | Yes |
| Gender | Select (Male / Female) | Yes |
| Class | Select (from `mockClasses`, filtered by `division` if provided) | Yes |
| Parent/Guardian Phone | Text input | No |
| Home Address | Textarea | No |
| Nationality | Text input | No |
| Religion | Text input | No |
| Photo | Disabled button with note | No (Phase 2b) |

**Student ID field:** Not shown on the form. Auto-generated by the action. Shown in the success toast: `"Student registered — ID: UHAS-2026-0011"`.

**Zod validation:**
- `firstName`, `lastName`: `z.string().min(2)`
- `dob`: valid ISO date, age between 3–20 years at time of registration
- `gender`: `z.enum(["Male", "Female"])`
- `classId`: `z.string().min(1)` — validated against `mockClasses` in the action

**On success:** `router.push` back to the students list, `toast.success` with the generated Student ID.
**On cancel:** `router.back()` link styled as a ghost button.

---

## 7. Detail Page Placeholder

`/admin/students/[id]` and `/deputy-head/students/[id]` render a simple card:
> "Student profile — full detail view coming in Phase 2b."

Includes the student's name and ID loaded from `mockStudents` so the URL is meaningful and the breadcrumb works.

---

## 8. Deferred Items

- Photo upload (Phase 2b)
- Full student detail / edit page (Phase 2b)
- Class transfer (Phase 2b)
- Audit log (Phase 1 DB cutover)
- Real DB integration (Phase 1 cutover)
- `USE_MOCK_DATA=false` path in all actions
