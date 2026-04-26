Here is the complete **Database Schema Documentation** for the UHAS Basic School Management System.

This document compiles all the architectural decisions, historical tracking requirements, and grading structures into a single, cohesive Drizzle ORM schema file (src/db/schema.ts).

# ---

**UHAS Basic School \- Database Schema Documentation (Drizzle ORM)**

**File Path:** src/db/schema.ts

**Database:** PostgreSQL (Neon Serverless)

**ORM:** Drizzle ORM

**Architecture Pattern:** Highly Normalized, Multi-Tenant (schoolId), Foreign Keys & Junction Tables.

### ---

**1\. Imports & Core Types**

We start by importing the necessary data types from the Drizzle PostgreSQL core package.

TypeScript

import {   
  pgTable,   
  uuid,   
  varchar,   
  integer,   
  boolean,   
  timestamp,   
  date,   
  jsonb,   
  primaryKey,   
  text   
} from 'drizzle-orm/pg-core';

### ---

**2\. Core Setup & Authentication Bridge**

The foundation of multi-tenant architecture. The users table bridges Firebase Auth with your application's roles and operational data.

TypeScript

// \--- SCHOOLS (Multi-Tenancy Anchor) \---  
export const schools \= pgTable('schools', {  
  id: uuid('id').defaultRandom().primaryKey(),  
  name: varchar('name', { length: 255 }).notNull(), // e.g., "UHAS Basic School"  
  academicYear: varchar('academic\_year', { length: 9 }).notNull(), // e.g., "2025/2026"  
  currentTerm: integer('current\_term').notNull(),  
  gradingScale: varchar('grading\_scale', { length: 50 }).default('GES\_STANDARD'),  
  isActive: boolean('is\_active').default(true),  
  createdAt: timestamp('created\_at').defaultNow(),  
});

// \--- USERS (Firebase Auth Bridge & RBAC) \---  
export const users \= pgTable('users', {  
  id: varchar('id', { length: 128 }).primaryKey(), // Firebase Auth UID  
  schoolId: uuid('school\_id').references(() \=\> schools.id).notNull(),  
  email: varchar('email', { length: 255 }).notNull().unique(),  
  role: varchar('role', { length: 50 }).notNull(), // 'Admin', 'Teacher', 'Parent', etc.  
  linkedId: varchar('linked\_id', { length: 128 }), // Points to staff.id, students.id, or guardians.id  
  isActive: boolean('is\_active').default(true),  
});

### ---

**3\. People (Staff, Students, Guardians)**

These tables store the actual profiles. Notice that students do not contain a classId—we use the enrollments table for that to preserve historical records.

TypeScript

// \--- STAFF \---  
export const staff \= pgTable('staff', {  
  id: varchar('id', { length: 50 }).primaryKey(), // e.g., STAFF-042  
  schoolId: uuid('school\_id').references(() \=\> schools.id).notNull(),  
  firstName: varchar('first\_name', { length: 255 }).notNull(),  
  lastName: varchar('last\_name', { length: 255 }).notNull(),  
  systemRole: varchar('system\_role', { length: 50 }), // e.g., 'Class Teacher', 'HOD'  
  division: varchar('division', { length: 50 }), // JHS, Primary, KG  
  isActive: boolean('is\_active').default(true),  
});

// \--- STUDENTS \---  
export const students \= pgTable('students', {  
  id: varchar('id', { length: 50 }).primaryKey(), // e.g., UHAS-2026-0001  
  schoolId: uuid('school\_id').references(() \=\> schools.id).notNull(),  
  firstName: varchar('first\_name', { length: 255 }).notNull(),  
  lastName: varchar('last\_name', { length: 255 }).notNull(),  
  dob: date('dob'),  
  isActive: boolean('is\_active').default(true),  
});

// \--- GUARDIANS \---  
export const guardians \= pgTable('guardians', {  
  id: uuid('id').defaultRandom().primaryKey(),  
  schoolId: uuid('school\_id').references(() \=\> schools.id).notNull(),  
  firstName: varchar('first\_name', { length: 255 }).notNull(),  
  lastName: varchar('last\_name', { length: 255 }).notNull(),  
  email: varchar('email', { length: 255 }).unique().notNull(), // Used for Auth bridging  
  phone: varchar('phone', { length: 50 }),  
});

// \--- JUNCTION: STUDENT GUARDIANS \---  
// Resolves the "Parent with multiple children" requirement  
export const studentGuardians \= pgTable('student\_guardians', {  
  studentId: varchar('student\_id').references(() \=\> students.id).notNull(),  
  guardianId: uuid('guardian\_id').references(() \=\> guardians.id).notNull(),  
  relation: varchar('relation', { length: 50 }), // e.g., 'Mother', 'Father', 'Uncle'  
}, (t) \=\> ({  
  pk: primaryKey({ columns: \[t.studentId, t.guardianId\] })   
}));

### ---

**4\. Academic Structure & History**

This maps out how the school is organized and tracks which student is in which class for a given academic year.

TypeScript

// \--- CLASSES \---  
export const classes \= pgTable('classes', {  
  id: uuid('id').defaultRandom().primaryKey(),  
  schoolId: uuid('school\_id').references(() \=\> schools.id).notNull(),  
  name: varchar('name', { length: 50 }).notNull(), // e.g., "JHS 1A"  
  academicYear: varchar('academic\_year', { length: 9 }).notNull(), // e.g., "2025/2026"  
  classTeacherId: varchar('class\_teacher\_id').references(() \=\> staff.id),  
});

// \--- SUBJECTS \---  
export const subjects \= pgTable('subjects', {  
  id: uuid('id').defaultRandom().primaryKey(),  
  schoolId: uuid('school\_id').references(() \=\> schools.id).notNull(),  
  name: varchar('name', { length: 100 }).notNull(), // e.g., "Integrated Science"  
  division: varchar('division', { length: 50 }), // 'JHS', 'Primary'  
  category: varchar('category', { length: 50 }).default('Core'), // 'Core' or 'Elective' (for report cards)  
});

// \--- JUNCTION: CLASS SUBJECTS \---  
// Maps exactly who teaches what subject in which class  
export const classSubjects \= pgTable('class\_subjects', {  
  classId: uuid('class\_id').references(() \=\> classes.id).notNull(),  
  subjectId: uuid('subject\_id').references(() \=\> subjects.id).notNull(),  
  teacherId: varchar('teacher\_id').references(() \=\> staff.id),  
}, (t) \=\> ({  
  pk: primaryKey({ columns: \[t.classId, t.subjectId\] })   
}));

// \--- ENROLLMENTS (Historical Tracking) \---  
// Used to promote students at the end of the year without losing past class history  
export const enrollments \= pgTable('enrollments', {  
  id: uuid('id').defaultRandom().primaryKey(),  
  studentId: varchar('student\_id').references(() \=\> students.id).notNull(),  
  classId: uuid('class\_id').references(() \=\> classes.id).notNull(),  
  academicYear: varchar('academic\_year', { length: 9 }).notNull(),  
  status: varchar('status', { length: 50 }).default('Active').notNull(), // 'Active', 'Completed'  
  enrollmentDate: date('enrollment\_date').defaultNow().notNull(),  
});

### ---

**5\. Daily Operations & Academic Planning**

Models for daily teacher tasks (Attendance and Lesson Plans/Schemes of Work).

TypeScript

// \--- ATTENDANCE SESSIONS \---  
// 1 row per class, per day to keep the database small and fast  
export const attendanceSessions \= pgTable('attendance\_sessions', {  
  id: uuid('id').defaultRandom().primaryKey(),  
  schoolId: uuid('school\_id').references(() \=\> schools.id).notNull(),  
  classId: uuid('class\_id').references(() \=\> classes.id).notNull(),  
  date: date('date').notNull(),  
  term: integer('term').notNull(),  
  submittedById: varchar('submitted\_by\_id').references(() \=\> staff.id),  
});

// \--- ATTENDANCE RECORDS \---  
// 1 row per student, linked to the session  
export const attendanceRecords \= pgTable('attendance\_records', {  
  sessionId: uuid('session\_id').references(() \=\> attendanceSessions.id).notNull(),  
  studentId: varchar('student\_id').references(() \=\> students.id).notNull(),  
  status: varchar('status', { length: 20 }).notNull(), // 'present', 'absent', 'late'  
  note: varchar('note', { length: 255 }), // e.g., "Sick leave"  
}, (t) \=\> ({  
  pk: primaryKey({ columns: \[t.sessionId, t.studentId\] })   
}));

// \--- LESSON PLANS (Workflow Model) \---  
export const lessonPlans \= pgTable('lesson\_plans', {  
  id: uuid('id').defaultRandom().primaryKey(),  
  schoolId: uuid('school\_id').references(() \=\> schools.id).notNull(),  
  teacherId: varchar('teacher\_id').references(() \=\> staff.id).notNull(),  
  subjectId: uuid('subject\_id').references(() \=\> subjects.id).notNull(),  
  term: integer('term').notNull(),  
  week: integer('week').notNull(),  
  topic: varchar('topic', { length: 255 }),  
  status: varchar('status', { length: 50 }).default('draft').notNull(), // draft, submitted, approved  
  fileUrl: varchar('file\_url', { length: 500 }), // Link to Firebase Cloud Storage PDF  
  reviewerComment: text('reviewer\_comment'),   
  reviewedBy: varchar('reviewed\_by').references(() \=\> staff.id),  
  updatedAt: timestamp('updated\_at').defaultNow(),  
});

### ---

**6\. Assessments (Exams & Results)**

Designed to handle both the single-score Midterms and the split-score (Class \+ Exam) End of Term structure.

TypeScript

// \--- EXAMS \---  
export const exams \= pgTable('exams', {  
  id: uuid('id').defaultRandom().primaryKey(),  
  schoolId: uuid('school\_id').references(() \=\> schools.id).notNull(),  
  name: varchar('name', { length: 100 }).notNull(), // e.g., "Mid-Term 1", "End of Term 2"  
  term: integer('term').notNull(),  
  academicYear: varchar('academic\_year', { length: 9 }).notNull(),  
  isPublished: boolean('is\_published').default(false), // Admin toggle for parent visibility  
});

// \--- SCORES \---  
export const scores \= pgTable('scores', {  
  id: uuid('id').defaultRandom().primaryKey(),  
  examId: uuid('exam\_id').references(() \=\> exams.id).notNull(),  
  studentId: varchar('student\_id').references(() \=\> students.id).notNull(),  
  subjectId: uuid('subject\_id').references(() \=\> subjects.id).notNull(),  
    
  // Raw inputs  
  classScore: integer('class\_score'), // Nullable for Midterms  
  examScore: integer('exam\_score'),   // Main score  
    
  // Auto-calculated outputs (calculated in Server Actions)  
  totalScore: integer('total\_score'),   
  grade: varchar('grade', { length: 5 }), // e.g., '1', '2' or 'A', 'B'  
  interpretation: varchar('interpretation', { length: 50 }), // e.g., "High Average"  
  subjectPosition: integer('subject\_position'), // Rank in class for this subject  
});

### ---

**How to use this file:**

1. Save all of the above code into a single file at src/db/schema.ts in your Next.js project.  
2. Ensure you have your drizzle.config.ts setup to point to this file.  
3. Run npx drizzle-kit push to instantly apply this architecture to your Neon PostgreSQL database.