

**UHAS BASIC SCHOOL**

School Management Software

*Software Requirements Specification (SRS)*

Version 1.0 — MVP Draft

April 2026

**Status: Draft — Pending Stakeholder Review**

*Prepared for internal planning and development purposes.*

# **Table of Contents**

# **1\. Introduction**

## **1.1 Purpose**

This Software Requirements Specification (SRS) defines the functional and non-functional requirements for the UHAS Basic School Management Software (UHAS SMS). It serves as the primary reference document for the development team, school administration, and stakeholders throughout the design, build, and testing phases.

## **1.2 Project Overview**

UHAS Basic School requires a centralised, web-based platform to digitise and streamline its core administrative and academic operations. The system will replace paper-based and fragmented processes across student management, staff management, academic planning, examinations, attendance, and parent communication.

## **1.3 Scope**

The MVP (Minimum Viable Product) covers the following modules:

* Student Registration & Management

* Staff Registration & Management

* Class & Subject Management

* Examination & Results Management

* Attendance Tracking (Students & Staff)

* Academic Planning (Lesson Plans & Schemes of Work)

* Lesson Plan Review & Approval Workflow

* Communication & Announcements

* Reports & Analytics

* User Authentication & Role-Based Access Control

The following are explicitly out of scope for MVP and deferred to Phase 2 or later:

* SMS gateway integration

* Payroll processing module

* Mobile native application (Android/iOS)

* Medical / Sick Bay records

* Counselling unit records

* Multi-school district management

* Fee management / school accounting

## **1.4 Intended Audience**

| Audience | Role | How They Use This Document |
| :---- | :---- | :---- |
| Development Team | Engineers & designers | Primary reference for building features, data models, and UI flows |
| School Admin | Head of School, Deputy Heads | Validate that system reflects real school operations |
| Stakeholders | Governing Board, PSC | Review scope and feature decisions |
| QA Team | Testers | Derive test cases and acceptance criteria |

## **1.5 Definitions & Abbreviations**

| SRS | Software Requirements Specification |
| :---- | :---- |
| **MVP** | Minimum Viable Product — the first shippable version of the system |
| **HOD / Subject Head** | Head of Department — supervises subject teachers in JHS division |
| **Deputy Head** | Division-level academic leader (JHS, Primary, or KG/Pre-School) |
| **SoW** | Scheme of Work — a term-level academic plan prepared by teachers |
| **GES** | Ghana Education Service — national curriculum and grading authority |
| **RBAC** | Role-Based Access Control — permissions tied to user roles |
| **FCM** | Firebase Cloud Messaging — push notification service |
| **KG** | Kindergarten |
| **JHS** | Junior High School |
| **PSC** | Parent School Conference (advisory body to Governing Board) |

# **2\. System Overview**

## **2.1 School Organisational Structure**

The UHAS Basic School operates a three-division academic structure under the Head of Basic School, as described in the official organogram:

| Division | Leader | Sub-roles |
| :---- | :---- | :---- |
| Junior High School (JHS) | Deputy Head — JHS | Subject Heads → Subject Teachers |
| Primary | Deputy Head — Primary | Class Teachers |
| Kindergarten & Pre-School | Deputy Head — KG/Pre-School | Class Teachers, Class Attendants |

Cross-cutting units that report to or advise the Head of School include:

* Accountant / Admin & Other Staff

* Medical Unit (Sick Bay)

* Counselling Unit

* P.S.C. (Parent Support Committee) — reports to Governing Board

## **2.2 System Architecture Summary**

The system is a web-based application accessible via any modern browser on desktop or mobile. The recommended technical stack is:

| Frontend | Next.js 14 (App Router) \+ React \+ Tailwind CSS \+ shadcn/ui |
| :---- | :---- |
| **Backend / API** | Next.js Server Actions \+ Firebase Cloud Functions |
| **Database** | Google Cloud Firestore (NoSQL document database) |
| **Authentication** | Firebase Authentication (email/password, custom tokens) |
| **File Storage** | Firebase Cloud Storage (lesson plans, documents, photos) |
| **Push Notifications** | Firebase Cloud Messaging (FCM) |
| **Email** | SendGrid via Cloud Functions |
| **Hosting** | Vercel/Firebase hosting or Railway (frontend)  |
|  |  |

## **2.3 User Roles**

The system defines eight distinct roles with different levels of access:

| Role | Scope | Description |
| :---- | :---- | :---- |
| Super Admin | Platform-wide | System owner. Manages school accounts, billing, and platform health. Does not access school academic data. |
| Admin (Head of School) | Whole school | Full access to all school data and operations. Configures the system for their school. |
| Deputy Head | One division | Academic manager for JHS, Primary, or KG division. Reviews plans and oversees teachers in their division. |
| Subject Head / HOD | One department | JHS-specific role. Reviews and approves lesson plans for their subject area. |
| Teacher / Class Teacher | Own classes only | Marks attendance, enters scores, creates lesson plans. Most active daily user. |
| Class Attendant | Own class only | KG/Pre-School support staff. Assists with attendance marking. |
| Accountant | Finance only | Manages payroll and financial records. No access to academic data. |
| Parent / Guardian | Own child only | View-only access to the child's profile, results, attendance, and announcements. |
| Student | Own data only | View-only access to own results, attendance, and announcements. (Phase 2 for basic schools.) |

# **3\. Functional Requirements**

## **3.1 User Authentication & Access Control**

### **3.1.1 Login**

* All users authenticate via email and password.

* On first login, users must change their system-assigned password.

* Failed login attempts are rate-limited (max 5 in 10 minutes, then temporary lockout).

* Admin can reset any school user's password.

* Super Admin can reset any user on the platform.

### **3.1.2 Role-Based Access Control**

* Every page and API endpoint enforces the user's role.

* Users can only see and act on data within their scope (division, department, or class).

* Role assignments are managed by Admin. A user can only hold one role at a time.

* Middleware on the frontend redirects users to their role-specific dashboard on login.

### **3.1.3 Session Management**

* Sessions expire after 8 hours of inactivity.

* Users are warned 5 minutes before session expiry with an option to extend.

* Concurrent sessions on multiple devices are permitted.

## **3.2 Student Management**

### **3.2.1 Student Registration**

* Admin can register a new student by filling in a structured form.

* Required fields: first name, last name, date of birth, gender, division, class, guardian name, guardian phone, guardian email.

* Optional fields: student photo, address, medical notes flag, secondary guardian.

* On saving, a unique Student ID is auto-generated in the format: UHAS-\[YEAR\]-\[SEQUENCE\] (e.g. UHAS-2025-0042 \- more concrete UHAS1141). Let them determine the format via the system

* Student IDs are immutable once assigned.

### **3.2.2 Student Records**

* Admin can edit any student record. All edits are audit-logged with timestamp and editor.

* Admin can deactivate (soft-delete) a student. Deactivated records are hidden from active lists but retained.

* Admin can transfer a student between classes within the same academic year.

* Teachers can view (read-only) the profiles of students in their assigned class.

* Parents can view only their child's profile \- or multiple children using a filter view.

### **3.2.3 Student ID Cards**

* Admin can generate a printable ID card (PDF) for any student.

* ID card includes: student photo, full name, student ID, class, academic year, school name and logo.

## **3.3 Staff Management**

### **3.3.1 Staff Registration**

* Admin registers all staff members (teachers, deputy heads, accountant, admin staff).

* Required fields: full name, rank/title, staff ID, role in system, division/department, subject(s) taught, phone, email.

* On registration, the system creates a user account and sends a welcome email with login credentials.

### **3.3.2 Role & Subject Assignment**

* Admin assigns each teacher to one or more subjects and one or more classes.

* A teacher assigned as Class Teacher is responsible for their class's daily attendance.

* Subject Heads are assigned to a subject area (e.g. Mathematics, Science) and have review authority over teachers in that subject.

* Deputy Heads are assigned to a division (JHS, Primary, or KG).

### **3.3.3 Staff Records**

* Admin can edit, deactivate, or reactivate staff records.

* Staff can view and update their own profile (limited fields — not role or assignment).

## **3.4 Class & Subject Management**

* Admin creates classes per academic year (e.g. JHS 1A, JHS 1B, Primary 4, KG 2).

* Admin creates subjects and links them to classes and divisions.

* Admin assigns a Class Teacher to each class.

* Admin assigns Subject Teachers to subjects per class (JHS) or confirms Class Teacher handles all subjects (Primary/KG).

* Admin creates and publishes the school timetable. Teachers and students can view their respective timetables. (not part of MVP now)

* Classroom allocation is recorded per class/period in the timetable.

## **3.5 Examination & Results Management**

### **3.5.1 Exam Configuration**

* Admin configures the exam types for the school year: e.g. Class Assessments, Mid-Term, End-of-Term.

* Admin configures the grading scale (default: GES scale — A1 through F9).

* Admin configures score components and weightings (e.g. Class Score 30%, Exam Score 70%).

### **3.5.2 Score Entry**

* Teachers enter scores for students in their assigned subject(s).

* Score entry is locked after Admin publishes results for that term.

* Admin can override any score with an audit trail.

* On saving a score, the system automatically computes the weighted total and assigns a grade and remark.

### **3.5.3 Report Cards**

* Admin or Deputy Head triggers report card generation per class or for the whole school.

* Report cards are generated as PDF documents.

* Each report card includes: student details, subject scores, grades, remarks, attendance summary, class position (optional), teacher comment, head's comment.

* Report cards can be downloaded by Admin or emailed directly to parents/guardians.

* KG/Pre-School report cards use a developmental milestone format (placeholder for now — to be defined in Phase 2 with school input).

* Parents/Guardians can see their wards performance \- class level in reference to other students, subject level across classes, across different academic years \- enough to show how student performance is improving over time by subject and class

### **3.5.4 Student Promotion**

* Class teacher  triggers automatic student promotion academic year ending and is approved by the Deputy head

* System displays for each class student promotion status based on academic performance. 

* The one in charge can determine if the generated outline is okay or can modify it

* Repeating a student will require a reason, and should be signed off by the Head of Department or Subject head

* Finalised list once submitted promotes students to next class

* We should keep track of historical classes of students

## **3.6 Attendance Management**

### **3.6.1 Student Attendance**

* Class Teachers mark daily attendance for their class (present / absent / late).

* Attendance is linked to a specific date, class, term, and academic year.

* Teachers can add a short note per student (e.g. 'sick', 'no note').

* Attendance can be marked or edited on the same day only. Past dates require Admin override.

### **3.6.2 Staff Attendance**

* Deputy Heads mark daily attendance for staff in their division.

* Admin can view and edit any staff attendance record.

### **3.6.3 Leave Management**

* Staff can submit leave requests (sick leave, personal leave, maternity/paternity leave) through the system.

* Leave requests are reviewed by the Deputy Head for their division, with final approval by Admin.

* Leave requests could be sick leave, maternity, or days off for wedding, funeral, special occasions etc

* Approved leave is reflected in staff attendance records automatically.

* Leave history is stored per staff member.

### **3.6.4 Attendance Reports**

* Attendance reports are available at class, division, and school level.

* Reports can be filtered by date range, class, division, and status (absent/late/present).

* A parent-facing attendance view shows their child's attendance history as a percentage and calendar.

## **3.7 Academic Planning Module**

### **3.7.1 Scheme of Work**

* Teachers create a Scheme of Work (SoW) per subject per term.

* SoW fields: term, subject, class, week-by-week topic breakdown, learning objectives, resources required.

* SoW can be created in-app using a structured form, or uploaded as a PDF/Word document.

* SoW is submitted for review following the same approval workflow as lesson plans.

### **3.7.2 Lesson Plans**

* Teachers create weekly lesson plans linked to their SoW.

* Lesson plan fields: week number, topic, learning objectives, teaching methods, resources, assessment plan.

* Supporting materials (notes, slides, PDFs) can be attached via file upload to Cloud Storage.

* Lesson plans have a status: Draft → Submitted → Approved / Rejected.

### **3.7.3 Approval Workflow**

The review chain depends on the division:

| Division | First Reviewer | Final Approver |
| :---- | :---- | :---- |
| JHS | Subject Head (HOD) — reviews subject-specific plans | Deputy Head JHS — final sign-off |
| Primary | Deputy Head Primary | Admin (Head of School) — if escalated |
| KG / Pre-School | Deputy Head KG | Admin (Head of School) — if escalated |

* Reviewer can: Approve (plan moves to Approved), Reject with comment (plan returns to Draft), or Request Changes.

* Teachers receive an in-app notification and email when their plan is reviewed.

* Rejected plans must be revised and resubmitted.

* Admin can see all plans across all divisions and override any decision.

## **3.8 Communication & Announcements**

* Admin can send school-wide announcements visible to all users.

* Deputy Heads can send announcements to their division (staff and parents of students in that division).

* Announcements are displayed in-app on the user's dashboard.

* Critical announcements trigger an email notification to all relevant recipients.

* Report cards are emailed to parents/guardians at the end of term (triggered by Admin).

* Teachers receive in-app notifications for: lesson plan status changes, new announcements, class updates.

* Parents receive in-app and email notifications for: new announcements, published results, low attendance alerts.

## **3.9 Reports & Analytics**

* Admin dashboard shows: total student count, attendance rate today, pending lesson plan approvals, recent announcements.

* Views by academic year: All users should be able to switch between different academic years and see relevant data for that

* Student performance report: average score per subject, pass/fail rates, top/bottom performers per class.

* Attendance summary: school-wide and per-class attendance rate per week/month/term.

* Lesson plan compliance report: how many teachers have submitted plans for the current week/term.

* All reports can be exported as PDF or printed directly from the browser.

* Deputy Head and Subject Head dashboards show division/department-level summaries.

* Academic calendar \- is seen by all users of the platform. Shows learning weeks, events \- internal and national, dates for quizzes, exams and special occasions

# **4\. Role Permission Matrix**

The table below summarises what each role can do across all modules. ✅ \= permitted, ✗ \= not permitted. Qualified entries (e.g. '✅ class') indicate scoped access.

| Feature / Action | Super Admin | Admin | Deputy Head | Subject Head / HOD | Teacher | Accountant | Parent | Student |
| :---- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| **STUDENT MANAGEMENT** |  |  |  |  |  |  |  |  |
| **Register student** | ✗ | **✅** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Edit student record** | ✗ | **✅** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **View all students** | ✗ | **✅** | **✅ div** | **✅ dept** | **✅ class** | ✗ | ✗ | ✗ |
| **View own child / self** | ✗ | **✅** | **✅** | **✅** | **✅** | ✗ | **✅** | **✅** |
| **Generate student ID** | ✗ | **✅** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **STAFF MANAGEMENT** |  |  |  |  |  |  |  |  |
| **Register staff** | ✗ | **✅** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Assign roles/subjects** | ✗ | **✅** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **View staff profiles** | ✗ | **✅** | **✅ div** | **✅ dept** | Own | ✗ | ✗ | ✗ |
| **View payslip** | ✗ | **✅** | **✅** | **✅** | **✅** | **✅** | ✗ | ✗ |
| **Manage payroll** | ✗ | **✅** | ✗ | ✗ | ✗ | **✅** | ✗ | ✗ |
| **CLASS MANAGEMENT** |  |  |  |  |  |  |  |  |
| **Create classes/subjects** | ✗ | **✅** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Assign teachers to classes** | ✗ | **✅** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **View timetable** | ✗ | **✅** | **✅** | **✅** | **✅** | ✗ | ✗ | **✅** |
| **EXAMS & RESULTS** |  |  |  |  |  |  |  |  |
| **Create exam** | ✗ | **✅** | ✗ | ✗ | **✅ own** | ✗ | ✗ | ✗ |
| **Enter scores** | ✗ | **✅** | ✗ | ✗ | **✅ own** | ✗ | ✗ | ✗ |
| **Override scores** | ✗ | **✅** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **View all scores** | ✗ | **✅** | **✅ div** | **✅ dept** | **✅ own** | ✗ | ✗ | ✗ |
| **View own/child scores** | ✗ | **✅** | **✅** | **✅** | **✅** | ✗ | **✅** | **✅** |
| **Publish results** | ✗ | **✅** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Generate report cards** | ✗ | **✅** | **✅ div** | **✅ dept** | **✅ own** | ✗ | ✗ | ✗ |
| **ATTENDANCE** |  |  |  |  |  |  |  |  |
| **Mark student attendance** | ✗ | **✅** | ✗ | ✗ | **✅ class** | ✗ | ✗ | ✗ |
| **Mark staff attendance** | ✗ | **✅** | **✅ div** | **✅ dept** | ✗ | ✗ | ✗ | ✗ |
| **View attendance reports** | ✗ | **✅** | **✅ div** | **✅ dept** | **✅ class** | ✗ | **✅ child** | **✅ own** |
| **Approve leave requests** | ✗ | **✅** | **✅ div** | **✅ dept** | ✗ | ✗ | ✗ | ✗ |
| **Submit leave request** | ✗ | **✅** | **✅** | **✅** | **✅** | **✅** | ✗ | ✗ |
| **ACADEMIC PLANNING** |  |  |  |  |  |  |  |  |
| **Create lesson plan / SoW** | ✗ | **✅** | ✗ | ✗ | **✅** | ✗ | ✗ | ✗ |
| **Submit plan for review** | ✗ | ✗ | ✗ | ✗ | **✅** | ✗ | ✗ | ✗ |
| **Review / approve plan** | ✗ | **✅** | **✅ div** | **✅ dept** | ✗ | ✗ | ✗ | ✗ |
| **Add feedback/comments** | ✗ | **✅** | **✅** | **✅** | ✗ | ✗ | ✗ | ✗ |
| **COMMUNICATION** |  |  |  |  |  |  |  |  |
| **School-wide announcement** | ✗ | **✅** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Division announcement** | ✗ | **✅** | **✅** | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Email report to parent** | ✗ | **✅** | **✅ div** | ✗ | ✗ | ✗ | ✗ | ✗ |
| **View announcements** | ✗ | **✅** | **✅** | **✅** | **✅** | **✅** | **✅** | **✅** |
| **USER MANAGEMENT** |  |  |  |  |  |  |  |  |
| **Create school account** | **✅** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Create school users** | **✅** | **✅** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Reset any password** | **✅** | **✅ school** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Manage billing/plan** | **✅** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

# **5\. Data Model Overview**

The system uses Google Cloud Firestore (NoSQL). Data is organised in top-level collections, each document scoped to a schoolId to support multi-school architecture from day one.

## **5.1 Core Collections**

| Collection | Key Fields | Notes |
| :---- | :---- | :---- |
| schools | name, region, academicYear, currentTerm, gradingScale, logoUrl | One document per school. Contains school-wide config. |
| users | uid, schoolId, email, role, linkedId, isActive | All authenticated users. linkedId links to student or staff doc. |
| students | schoolId, studentId, firstName, lastName, dob, classId, guardians\[ \] | guardians is an array to support multiple guardians per student. |
| staff | schoolId, staffId, name, rank, role, divisionId, subjectIds\[ \] | All teaching and non-teaching staff. |
| classes | schoolId, name, level, division, classTeacherId, subjectIds\[ \] | One doc per class per academic year. |
| subjects | schoolId, name, division, classIds\[ \] | Linked to classes and staff. |
| exams | schoolId, name, type, term, subjectId, classId, components\[ \] | Components hold weights (e.g. classScore: 30, examScore: 70). |
| scores | schoolId, examId, studentId, subjectId, components{ }, totalScore, grade | Auto-graded by Cloud Function on write. |
| attendance | schoolId, classId, date, type, records{ studentId: status } | Records is a map — avoids one doc per student per day. |
| lessonPlans | schoolId, teacherId, subjectId, term, week, status, fileUrl, hodComment | Status: draft | submitted | approved | rejected. |
| announcements | schoolId, title, body, audience, createdBy, createdAt | Audience: all | division:JHS | class:class\_001 etc. |
| reportCards | schoolId, studentId, term, academicYear, scores\[ \], fileUrl | PDF stored in Cloud Storage, URL saved here. |
| leaveRequests | schoolId, staffId, type, startDate, endDate, status, approvedBy | Status: pending | approved | rejected. |

## **5.2 Firestore Security Rules Summary**

Full security rules are defined in firestore.rules. Key principles:

* Every read/write checks request.auth \!= null (no unauthenticated access).

* Every document includes a schoolId field. Users can only access documents where schoolId matches their own.

* Role is read from the users/{uid} document and enforced per collection.

* Teachers can only write to scores and attendance for classes they are assigned to.

* Parents can only read documents linked to their child's studentId.

* Lesson plans can only be updated by the owning teacher (status: draft) or a reviewer (status: approved/rejected).

# **6\. Non-Functional Requirements**

## **6.1 Performance**

* Page load time must be under 3 seconds on a standard 3G mobile connection.

* Attendance marking for a class of 40 students must complete within 2 seconds of submission.

* Report card PDF generation for a full class must complete within 30 seconds.

## **6.2 Availability & Reliability**

* Target uptime: 99.5% (excluding scheduled maintenance).

* Firestore's built-in offline support provides graceful degradation when internet is temporarily lost — queued writes sync when connectivity resumes.

* Scheduled maintenance windows communicated at least 24 hours in advance via in-app announcement.

## **6.3 Security**

* All data in transit is encrypted via HTTPS/TLS.

* All data at rest encrypted by Firebase/Google Cloud by default.

* Passwords hashed by Firebase Authentication (bcrypt).

* All admin actions (score overrides, role changes, student edits) are audit-logged with timestamp and user ID.

* File uploads are scanned for size limits (max 10MB per file) and restricted to allowed MIME types (PDF, DOCX, PPTX, JPG, PNG).

## **6.4 Usability**

* The interface must be usable on a smartphone (minimum 375px screen width) without horizontal scrolling.

* Attendance marking must be completable in under 2 minutes for a class of 40\.

* All destructive actions (delete, deactivate, publish) require a confirmation prompt.

* Error messages must be specific and actionable (not generic 'something went wrong' messages).

## **6.5 Accessibility**

* Minimum WCAG 2.1 Level AA compliance for all user-facing pages.

* All form inputs have visible labels and keyboard-navigable focus states.

## **6.6 Scalability**

* The data model uses schoolId scoping throughout, enabling multi-school support without architectural changes.

* Firebase auto-scales — no manual infrastructure provisioning required.

* The system must support up to 1,000 students and 100 staff per school at MVP without performance degradation.

# **7\. MVP Development Plan**

## **7.1 Phased Delivery**

| Phase | Duration | Deliverables |
| :---- | :---- | :---- |
| Phase 0 — Setup | 1 week | Firebase project, Next.js scaffold, Firestore schema, CI/CD pipeline, Vercel deployment |
| Phase 1 — Core Auth & Admin | 2 weeks | Login, role-based routing, school setup, user management, student & staff registration |
| Phase 2 — Classes & Attendance | 2 weeks | Class/subject creation, teacher assignment, timetable, daily attendance marking |
| Phase 3 — Exams & Results | 3 weeks | Score entry, auto-grading Cloud Function, report card PDF generation |
| Phase 4 — Academic Planning | 2 weeks | Lesson plan creation, file upload, submission and HOD/Deputy Head review workflow |
| Phase 5 — Communication | 1 week | Announcements, email notifications (SendGrid), parent email report card delivery |
| Phase 6 — Reports & QA | 2 weeks | Admin/teacher dashboards, report exports, bug fixes, user acceptance testing with pilot school |
| Total | \~13 weeks | Launchable MVP ready for pilot deployment |

## 

# **8\. Open Questions & Assumptions**

The following items require confirmation from school stakeholders before finalisation of the spec:

| \# | Question | Impact if Unresolved |
| :---- | :---- | :---- |
| 1 | Does the lesson plan approval chain for JHS go: Teacher → Subject Head → Deputy Head JHS, or does Subject Head have final authority? | Lesson plan goes to Deputy Head for Approval |
| 2 | What does PSC stand for, and do PSC members need system access? | PSC \- Stands for Parent-School Conference like PTA. PSC Members do not access the system. But the Head of School should be able to generate the Needed report for them1\. Total Population 2\. Boys and Girls in each class  3\. Learners to leave the school  4\. Number of teacher in each department (JHS, Primary and KG department)  Etc  |
| 3 | Does the Governing Board need any read-only reporting access? | Additional roles may be required. Head of school should be able to do that |
| 4 | Do Class Attendants mark attendance independently, or does the Class Teacher own attendance for KG? | Attendance permission design. Class teachers mark attendance each.  |
| 5 | What is the full class structure? (Creche, Nursery, KG 1/2, Primary 1–6, JHS 1–3?) | Class setup and timetable structureKG Department (KG 1 and KG2)Primary Department (1-6)JHS Department (1-3) |
| 6 | Does UHAS use the standard GES grading scale, or a custom one? | Grading configuration module We use the standard grading system but slightly adjusted |
| 7 | Are report card formats different for KG vs Primary vs JHS? | Report card template design I will forward the End of Term and Midterm Report Template to you |
| 8 | Who publishes results — Admin only, or can Deputy Heads publish for their division? | Results workflow. The head of school read each report card and corrected comments before signing. After heads approval the school admin should be able to publish the report.  |
| 9 | Do teachers have personal smartphones/laptops for daily use, or shared devices? | Mobile UX priority. Teachers have personal smartphones, computers and laptops. We can start with the web app and then later add the mobile app.  |
| 10 | Is internet access reliable at school, or is offline attendance marking needed for MVP? | Offline-first architecture decision The school has a stable internet connection.  |
| 11 | What data currently exists (Excel, paper)? Is a data migration needed at launch? | Onboarding and launch timeline Data exist mostly on paper but I can take the data and put them into excel for easy integration into the system |
| 12 | Should the system support local language (Ewe / Twi) for parent-facing content? | English is fine but the Ewe teachers should be able to write part of their lessons in Ewe |

*End of Document — UHAS Basic School Management Software SRS v1.0*