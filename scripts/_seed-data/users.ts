// Seed users for the Firebase Auth Emulator.
// One account per role — used by scripts/seed-emulator-users.ts

export const mockUsers = [
  {
    uid: "uid-admin-001",
    email: "admin@uhas.edu.gh",
    password: "Admin@1234",
    displayName: "Mawuli Agbenyega",
    role: "Admin",
    linkedId: "STAFF-001",
  },
  {
    uid: "uid-deputyhead-jhs",
    email: "dh.jhs@uhas.edu.gh",
    password: "Deputy@1234",
    displayName: "Dzifa Adzogenu",
    role: "DeputyHead",
    linkedId: "STAFF-002",
  },
  {
    uid: "uid-deputyhead-lower-primary",
    email: "dh.lower-primary@uhas.edu.gh",
    password: "Deputy@1234",
    displayName: "Kodzo Mensah",
    role: "DeputyHead",
    linkedId: "STAFF-003",
  },
  {
    uid: "uid-deputyhead-upper-primary",
    email: "dh.upper-primary@uhas.edu.gh",
    password: "Deputy@1234",
    displayName: "Edinam Asare",
    role: "DeputyHead",
    linkedId: "STAFF-016",
  },
  {
    uid: "uid-deputyhead-kg",
    email: "dh.kg@uhas.edu.gh",
    password: "Deputy@1234",
    displayName: "Akorfa Doe",
    role: "DeputyHead",
    linkedId: "STAFF-007",
  },
  {
    uid: "uid-unit-head-jhs",
    email: "unit-head.jhs@uhas.edu.gh",
    password: "UnitHead@1234",
    displayName: "Akpene Kpodo",
    role: "Teacher",
    linkedId: "STAFF-004",
  },
  {
    uid: "uid-teacher-001",
    email: "teacher@uhas.edu.gh",
    password: "Teacher@1234",
    displayName: "Selorm Tornu",
    role: "Teacher",
    linkedId: "STAFF-005",
  },
  {
    uid: "uid-parent-001",
    email: "parent@uhas.edu.gh",
    password: "Parent@1234",
    displayName: "Mawuli Agbeko",
    role: "Parent",
    linkedId: "guardian-001",
  },
];
