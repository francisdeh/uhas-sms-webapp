export type MockStaff = {
  id: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  rank: string;
  systemRole: string;
  division: string | null;
  phone: string;
  email: string;
  isActive: boolean;
};

export const mockStaff: MockStaff[] = [
  {
    id: "STAFF-001",
    schoolId: "school-uhas-001",
    firstName: "Emmanuel",
    lastName: "Asante",
    rank: "Head of School",
    systemRole: "Admin",
    division: null,
    phone: "0244000001",
    email: "e.asante@uhas.edu.gh",
    isActive: true,
  },
  {
    id: "STAFF-002",
    schoolId: "school-uhas-001",
    firstName: "Abena",
    lastName: "Mensah",
    rank: "Deputy Head",
    systemRole: "DeputyHead",
    division: "JHS",
    phone: "0244000002",
    email: "a.mensah@uhas.edu.gh",
    isActive: true,
  },
  {
    id: "STAFF-003",
    schoolId: "school-uhas-001",
    firstName: "Kofi",
    lastName: "Boateng",
    rank: "Deputy Head",
    systemRole: "DeputyHead",
    division: "Primary",
    phone: "0244000003",
    email: "k.boateng@uhas.edu.gh",
    isActive: true,
  },
  {
    id: "STAFF-004",
    schoolId: "school-uhas-001",
    firstName: "Ama",
    lastName: "Owusu",
    rank: "Subject Head",
    systemRole: "HOD",
    division: "JHS",
    phone: "0244000004",
    email: "a.owusu@uhas.edu.gh",
    isActive: true,
  },
  {
    id: "STAFF-005",
    schoolId: "school-uhas-001",
    firstName: "Kwame",
    lastName: "Darko",
    rank: "Teacher",
    systemRole: "Teacher",
    division: "JHS",
    phone: "0244000005",
    email: "k.darko@uhas.edu.gh",
    isActive: true,
  },
  {
    id: "STAFF-006",
    schoolId: "school-uhas-001",
    firstName: "Gifty",
    lastName: "Acheampong",
    rank: "Class Teacher",
    systemRole: "Teacher",
    division: "Primary",
    phone: "0244000006",
    email: "g.acheampong@uhas.edu.gh",
    isActive: true,
  },
];
