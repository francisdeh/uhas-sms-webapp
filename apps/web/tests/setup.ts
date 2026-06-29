// Global Vitest setup. Runs once per worker before any test file.
//
// Loads .env.test, registers the cookie + Supabase server-client mocks,
// and exposes `signInAs(role)` so integration tests can stage a session
// in one line. Phase 1 PR #9 swapped Firebase Auth for Supabase Auth —
// the signInAs() shape stays the same so existing tests still compile.

import { config } from "dotenv";
import { vi } from "vitest";

import { det } from "../scripts/_seed-data/_uuid";

config({ path: ".env.test" });

// ─── Cookie store mock ───────────────────────────────────────────────────────
// Cookies are still mocked so non-auth code paths that read cookies
// (e.g. theme preferences) keep working. The Supabase session itself
// is driven through the supabase-server mock below, not cookies.

type CookieEntry = { value: string };
let cookieStore = new Map<string, CookieEntry>();

// `server-only` is a Next.js guard that exists as a real package in
// node_modules but throws if imported from a client bundle. Vitest's Node
// environment doesn't ship it; stub it out so server modules can be
// imported by tests.
vi.mock("server-only", () => ({}));

// React's `cache()` is for server components. In a Node test context the
// React import returns the client build, which doesn't expose `cache`.
// Pass-through identity is fine for tests — we just want the inner fn to
// execute on each call.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
  };
});

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (k: string) => cookieStore.get(k),
      set: (k: string, v: string) => {
        cookieStore.set(k, { value: v });
      },
      delete: (k: string) => {
        cookieStore.delete(k);
      },
    }),
}));

// next/cache — revalidatePath/Tag/updateTag throw outside a request context.
// unstable_cache is a no-op pass-through so cached functions work in tests.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: <Args extends unknown[], R>(fn: (...args: Args) => R) => fn,
}));

// ─── Supabase server-client mock ─────────────────────────────────────────────
// getSessionUser() + any other server-side caller of @/lib/supabase/server
// goes through here. The current "signed-in" user is held in
// `currentSupabaseUser`; signInAs/signOut mutate it.

type SupabaseAuthUserShape = {
  id: string;
  email: string | null;
  phone: string | null;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
};
let currentSupabaseUser: SupabaseAuthUserShape | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: currentSupabaseUser },
        error: null,
      })),
      signOut: vi.fn(async () => {
        currentSupabaseUser = null;
        return { error: null };
      }),
    },
  })),
}));

// ─── Supabase admin client mock ──────────────────────────────────────────────
// manage-users + storage-admin call getSupabaseAdmin() to mint signed
// URLs and create/update auth users. We return a controllable stub so
// tests can drive those paths without a real Supabase project.

const supabaseAdminMock = {
  auth: {
    admin: {
      createUser: vi.fn(async (input: { email?: string; phone?: string }) => ({
        data: {
          user: {
            id: `supa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            email: input.email ?? null,
            phone: input.phone ?? null,
          },
        },
        error: null,
      })),
      updateUserById: vi.fn(async () => ({ data: { user: null }, error: null })),
      deleteUser: vi.fn(async () => ({ data: null, error: null })),
      generateLink: vi.fn(async () => ({
        data: { properties: { action_link: "https://example.invalid/recovery" } },
        error: null,
      })),
    },
  },
  storage: {
    from: vi.fn(() => ({
      createSignedUrl: vi.fn(async () => ({
        data: { signedUrl: "https://example.invalid/signed-url" },
        error: null,
      })),
    })),
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => supabaseAdminMock,
}));

// ─── Test helpers ────────────────────────────────────────────────────────────

export type TestRole = "Admin" | "DeputyHead" | "Teacher" | "Parent";

// Pre-seeded UUIDs from scripts/_seed-data/users.ts. Each role maps to
// a known seed user so tests can sign in by role name.
const ROLE_UIDS: Record<TestRole, string> = {
  Admin: "00000000-0000-0000-0000-000000000001",
  DeputyHead: "00000000-0000-0000-0000-000000000002",
  Teacher: "00000000-0000-0000-0000-000000000007",
  Parent: "00000000-0000-0000-0000-000000000008",
};

// linkedId values are the det() UUIDs of the matching staff / guardian
// rows — same translation the seed-db.ts applies on insert. Tests that
// override pass either the slug ("STAFF-004") expecting det() lookup,
// or a raw uuid for adversarial cases.
const ROLE_LINKED_IDS: Record<TestRole, string> = {
  Admin: det("STAFF-001"),
  DeputyHead: det("STAFF-002"),
  Teacher: det("STAFF-005"),
  Parent: det("guardian-001"),
};

// Expose so tests can call signInAs("Teacher", { linkedId: linkedIdFromSlug("STAFF-004") }).
export const linkedIdFromSlug = (slug: string) => det(slug);
export const schoolIdFromSlug = (slug: string) => det(slug);

const ROLE_EMAILS: Record<TestRole, string> = {
  Admin: "admin@uhas.edu.gh",
  DeputyHead: "dh.jhs@uhas.edu.gh",
  Teacher: "teacher@uhas.edu.gh",
  Parent: "parent@uhas.edu.gh",
};

const ROLE_NAMES: Record<TestRole, string> = {
  Admin: "Mawuli Agbenyega",
  DeputyHead: "Dzifa Adzogenu",
  Teacher: "Selorm Tornu",
  Parent: "Mawuli Agbeko",
};

/**
 * Stage a session as one of the seed users. Call at the start of any
 * test that exercises a Server Component or Server Action which reads
 * the current user via getSessionUser().
 *
 * Overrides let a test swap individual fields — e.g. signInAs("Teacher",
 * { uid: "<other-uuid>", linkedId: "STAFF-004" }) to test the Unit-Head
 * Teacher path with that specific bridge row.
 */
export function signInAs(
  role: TestRole,
  overrides?: Partial<{
    uid: string;
    linkedId: string;
    email: string;
    role: TestRole;
    mustChangePassword: boolean;
  }>,
) {
  cookieStore = new Map();
  currentSupabaseUser = {
    id: overrides?.uid ?? ROLE_UIDS[role],
    email: overrides?.email ?? ROLE_EMAILS[role],
    phone: null,
    app_metadata: {
      role: overrides?.role ?? role,
      school_id: det("school-uhas-001"),
      linked_id: overrides?.linkedId ?? ROLE_LINKED_IDS[role],
    },
    user_metadata: {
      display_name: ROLE_NAMES[role],
      must_change_password: overrides?.mustChangePassword ?? false,
    },
  };
}

export function signOut() {
  cookieStore = new Map();
  currentSupabaseUser = null;
}

export function getCookie(key: string): string | undefined {
  return cookieStore.get(key)?.value;
}

// Lets tests change Supabase admin behaviour for a single test
// (used by manage-users flows).
export { supabaseAdminMock };
