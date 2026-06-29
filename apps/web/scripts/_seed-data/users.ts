/**
 * Seed users for Supabase Auth + the bridge `users` table.
 *
 * The `uid` here is the user's Supabase Auth UUID — same value across:
 *   - auth.users.id   (Supabase Auth, set by seed-supabase-users.ts)
 *   - public.users.id (bridge table, set by seed-db.ts)
 *   - audit_log.actor_id (FK to public.users.id)
 *
 * Hand-picked UUIDs (not generated) so they're greppable in logs, stable
 * across machines, and tied to the role they represent.
 *
 * Phase 1 PR #9 replaces the legacy "uid-admin-001"-style strings with
 * proper UUIDs to match Supabase Auth's column type.
 */

export interface SeedUser {
  uid: string;
  email: string;
  /** For phone-OTP-capable accounts (currently just Parent). */
  phone?: string;
  password: string;
  displayName: string;
  role: "Admin" | "DeputyHead" | "Teacher" | "Parent" | "Accountant";
  linkedId: string;
}

export const mockUsers: SeedUser[] = [
  {
    uid: "00000000-0000-0000-0000-000000000001",
    email: "admin@uhas.edu.gh",
    password: "Admin@1234",
    displayName: "Mawuli Agbenyega",
    role: "Admin",
    linkedId: "STAFF-001",
  },
  {
    uid: "00000000-0000-0000-0000-000000000002",
    email: "dh.jhs@uhas.edu.gh",
    password: "Deputy@1234",
    displayName: "Dzifa Adzogenu",
    role: "DeputyHead",
    linkedId: "STAFF-002",
  },
  {
    uid: "00000000-0000-0000-0000-000000000003",
    email: "dh.lower-primary@uhas.edu.gh",
    password: "Deputy@1234",
    displayName: "Kodzo Mensah",
    role: "DeputyHead",
    linkedId: "STAFF-003",
  },
  {
    uid: "00000000-0000-0000-0000-000000000004",
    email: "dh.upper-primary@uhas.edu.gh",
    password: "Deputy@1234",
    displayName: "Edinam Asare",
    role: "DeputyHead",
    linkedId: "STAFF-016",
  },
  {
    uid: "00000000-0000-0000-0000-000000000005",
    email: "dh.kg@uhas.edu.gh",
    password: "Deputy@1234",
    displayName: "Akorfa Doe",
    role: "DeputyHead",
    linkedId: "STAFF-007",
  },
  {
    uid: "00000000-0000-0000-0000-000000000006",
    email: "unit-head.jhs@uhas.edu.gh",
    password: "UnitHead@1234",
    displayName: "Akpene Kpodo",
    role: "Teacher",
    linkedId: "STAFF-004",
  },
  {
    uid: "00000000-0000-0000-0000-000000000007",
    email: "teacher@uhas.edu.gh",
    password: "Teacher@1234",
    displayName: "Selorm Tornu",
    role: "Teacher",
    linkedId: "STAFF-005",
  },
  {
    // Parent has BOTH email and phone — they can sign in either way:
    //   email + password    (the standard flow)
    //   phone + OTP         (uses test_otp from supabase/config.toml in dev)
    // The phone matches the entry under [auth.sms.test_otp], so signing
    // in with "+233200000001" + "123456" works without hitting Hubtel.
    uid: "00000000-0000-0000-0000-000000000008",
    email: "parent@uhas.edu.gh",
    phone: "+233200000001",
    password: "Parent@1234",
    displayName: "Mawuli Agbeko",
    role: "Parent",
    linkedId: "guardian-001",
  },
  {
    uid: "00000000-0000-0000-0000-000000000009",
    email: "accountant@uhas.edu.gh",
    password: "Accountant@1234",
    displayName: "Yayra Mensah",
    role: "Accountant",
    linkedId: "STAFF-017",
  },
];
