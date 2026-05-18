// Seed users for the Firebase Auth Emulator.
// One account per role — used by scripts/seed-emulator-users.ts

export const mockUsers = [
  {
    uid: "uid-admin-001",
    email: "admin@uhas.edu.gh",
    password: "Admin@1234",
    displayName: "Emmanuel Asante",
    role: "Admin",
    linkedId: "STAFF-001",
  },
  {
    uid: "uid-deputyhead-jhs",
    email: "dh.jhs@uhas.edu.gh",
    password: "Deputy@1234",
    displayName: "Abena Mensah",
    role: "DeputyHead",
    linkedId: "STAFF-002",
  },
  {
    uid: "uid-deputyhead-lower-primary",
    email: "dh.lower-primary@uhas.edu.gh",
    password: "Deputy@1234",
    displayName: "Kofi Boateng",
    role: "DeputyHead",
    linkedId: "STAFF-003",
  },
  {
    uid: "uid-deputyhead-upper-primary",
    email: "dh.upper-primary@uhas.edu.gh",
    password: "Deputy@1234",
    displayName: "Grace Asare",
    role: "DeputyHead",
    linkedId: "STAFF-016",
  },
  {
    uid: "uid-deputyhead-kg",
    email: "dh.kg@uhas.edu.gh",
    password: "Deputy@1234",
    displayName: "Ofosua Akosua",
    role: "DeputyHead",
    linkedId: "STAFF-007",
  },
  {
    uid: "uid-unit-head-jhs",
    email: "unit-head.jhs@uhas.edu.gh",
    password: "UnitHead@1234",
    displayName: "Ama Owusu",
    role: "Teacher",
    linkedId: "STAFF-004",
  },
  {
    uid: "uid-teacher-001",
    email: "teacher@uhas.edu.gh",
    password: "Teacher@1234",
    displayName: "Kwame Darko",
    role: "Teacher",
    linkedId: "STAFF-005",
  },
  {
    uid: "uid-parent-001",
    email: "parent@uhas.edu.gh",
    password: "Parent@1234",
    displayName: "Yaw Boateng",
    role: "Parent",
    linkedId: "guardian-001",
  },
];
