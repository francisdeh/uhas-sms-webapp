export type MockStudent = {
  id: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: "Male" | "Female";
  classId: string;
  className: string;
  division: string;
  isActive: boolean;
};

export const mockStudents: MockStudent[] = [
  { id: "UHAS-2026-0001", schoolId: "school-uhas-001", firstName: "Akosua", lastName: "Boateng", dob: "2012-03-15", gender: "Female", classId: "class-jhs1a", className: "JHS 1A", division: "JHS", isActive: true },
  { id: "UHAS-2026-0002", schoolId: "school-uhas-001", firstName: "Yaw", lastName: "Asiedu", dob: "2012-07-22", gender: "Male", classId: "class-jhs1a", className: "JHS 1A", division: "JHS", isActive: true },
  { id: "UHAS-2026-0003", schoolId: "school-uhas-001", firstName: "Efua", lastName: "Mensah", dob: "2011-11-08", gender: "Female", classId: "class-jhs2a", className: "JHS 2A", division: "JHS", isActive: true },
  { id: "UHAS-2026-0004", schoolId: "school-uhas-001", firstName: "Kweku", lastName: "Amponsah", dob: "2011-01-30", gender: "Male", classId: "class-jhs2a", className: "JHS 2A", division: "JHS", isActive: true },
  { id: "UHAS-2026-0005", schoolId: "school-uhas-001", firstName: "Adwoa", lastName: "Antwi", dob: "2013-05-18", gender: "Female", classId: "class-p5", className: "Primary 5", division: "Primary", isActive: true },
  { id: "UHAS-2026-0006", schoolId: "school-uhas-001", firstName: "Kojo", lastName: "Frimpong", dob: "2013-09-02", gender: "Male", classId: "class-p5", className: "Primary 5", division: "Primary", isActive: true },
  { id: "UHAS-2026-0007", schoolId: "school-uhas-001", firstName: "Abena", lastName: "Sarpong", dob: "2014-12-14", gender: "Female", classId: "class-p4", className: "Primary 4", division: "Primary", isActive: true },
  { id: "UHAS-2026-0008", schoolId: "school-uhas-001", firstName: "Fiifi", lastName: "Tetteh", dob: "2018-04-25", gender: "Male", classId: "class-kg2", className: "KG 2", division: "KG", isActive: true },
  { id: "UHAS-2026-0009", schoolId: "school-uhas-001", firstName: "Nana", lastName: "Owusu", dob: "2018-08-11", gender: "Female", classId: "class-kg2", className: "KG 2", division: "KG", isActive: true },
  { id: "UHAS-2026-0010", schoolId: "school-uhas-001", firstName: "Ato", lastName: "Quaye", dob: "2010-06-19", gender: "Male", classId: "class-jhs3a", className: "JHS 3A", division: "JHS", isActive: true },
];
