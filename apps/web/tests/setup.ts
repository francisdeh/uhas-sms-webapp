// Global Vitest setup. Runs once per worker before any test file.
//
// Loads .env.test, registers the cookie + firebase-admin mocks, and exposes
// `signInAs(role)` so integration tests can stage a session in one line.

import { config } from "dotenv";
import { vi } from "vitest";

config({ path: ".env.test" });

// ─── Cookie store mock ───────────────────────────────────────────────────────

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

// ─── Firebase Admin mock ─────────────────────────────────────────────────────
// loginAction calls adminAuth.verifyIdToken(idToken); change-password +
// manage-users call adminAuth.updateUser / createUser / generatePasswordResetLink.
// We return controllable stubs so tests can drive the auth flow without a real
// Firebase project.

const adminAuthMock = {
  verifyIdToken: vi.fn(async (token: string) => {
    // Convention: tests pass the seed UID as the token.
    return { uid: token, email: token === "uid-admin-001" ? "admin@uhas.edu.gh" : "" };
  }),
  updateUser: vi.fn(async () => ({})),
  createUser: vi.fn(async (input: { email: string }) => ({
    uid: `fbuid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email: input.email,
  })),
  generatePasswordResetLink: vi.fn(async () => "https://example.invalid/reset"),
  setCustomUserClaims: vi.fn(async () => ({})),
  listUsers: vi.fn(async () => ({ users: [], pageToken: undefined })),
  getUserByEmail: vi.fn(async () => ({ uid: "stub" })),
};

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => adminAuthMock,
}));

vi.mock("firebase-admin/app", () => ({
  initializeApp: () => ({}),
  getApps: () => [{}],
  cert: () => ({}),
}));

vi.mock("firebase-admin/storage", () => ({
  getStorage: () => ({
    bucket: () => ({
      name: "test-bucket",
      file: () => ({
        getSignedUrl: async () => ["https://example.invalid/signed-url"],
      }),
    }),
  }),
}));

// ─── Test helpers ────────────────────────────────────────────────────────────

export type TestRole = "Admin" | "DeputyHead" | "Teacher" | "Parent";

// Pre-seeded UIDs from scripts/_seed-data/users.ts. Each role maps to a known
// seed user so tests can sign in by role name.
const ROLE_UIDS: Record<TestRole, string> = {
  Admin: "uid-admin-001",
  DeputyHead: "uid-deputyhead-jhs",
  Teacher: "uid-teacher-001",
  Parent: "uid-parent-001",
};

const ROLE_LINKED_IDS: Record<TestRole, string> = {
  Admin: "STAFF-001",
  DeputyHead: "STAFF-002",
  Teacher: "STAFF-005",
  Parent: "guardian-001",
};

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

// Stage a session as one of the seed users. Call at the start of any test
// that exercises a server action which reads cookies.
export function signInAs(role: TestRole, overrides?: Partial<Record<string, string>>) {
  cookieStore = new Map();
  cookieStore.set("session_uid", { value: ROLE_UIDS[role] });
  cookieStore.set("session_role", { value: role });
  cookieStore.set("session_display_name", { value: ROLE_NAMES[role] });
  cookieStore.set("session_email", { value: ROLE_EMAILS[role] });
  cookieStore.set("session_linked_id", { value: ROLE_LINKED_IDS[role] });
  cookieStore.set("session_expires_at", { value: String(Date.now() + 8 * 60 * 60 * 1000) });
  for (const [k, v] of Object.entries(overrides ?? {})) {
    if (v == null) {
      cookieStore.delete(k);
    } else {
      cookieStore.set(k, { value: v });
    }
  }
}

export function signOut() {
  cookieStore = new Map();
}

export function getCookie(key: string): string | undefined {
  return cookieStore.get(key)?.value;
}

// Lets tests change the verifyIdToken behaviour for a single test.
export { adminAuthMock };
