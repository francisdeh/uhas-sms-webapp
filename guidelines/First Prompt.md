Here is a highly detailed, instruction-dense prompt you can feed into an AI coding assistant (like Cursor, GitHub Copilot Chat, Claude, or ChatGPT) to generate the perfect foundational scaffold for your application. 

This prompt uses a **Feature-Based Architecture** (often called Feature-Sliced Design), which is the absolute best practice for large Next.js applications to keep your domains (like Academics vs. Attendance) strictly organized.

***

**Copy and paste the following prompt into your AI coding assistant:**

> **System Prompt: Enterprise Next.js Project Scaffolding**
> 
> You are an expert Next.js 14 software architect building the UHAS Basic School Management System (MVP). Your task is to scaffold the foundational project structure, configuration files, and root layouts. 
> 
> **Tech Stack & Libraries:**
> * **Framework:** Next.js 14 (App Router) with TypeScript.
> * **Styling & UI:** Tailwind CSS, `shadcn/ui` (with `lucide-react` for icons).
> * **Notifications:** `sonner` (for toast notifications).
> * **Data Fetching & State:** TanStack Query v5 (React Query).
> * **Database & ORM:** Drizzle ORM querying a Neon PostgreSQL database.
> * **Testing:** Jest and React Testing Library.
> 
> **Architectural Rules:**
> 1.  **Feature-Based Modularization:** We will not dump all components into `src/components`. We will use a `src/features/` directory. Each feature (e.g., `auth`, `attendance`, `academics`) will have its own internal `components`, `actions`, `queries`, and `types` folders.
> 2.  **Server vs. Client:** Use Next.js Server Components by default. Use TanStack Query specifically for complex client-side data fetching, caching, and optimistic UI updates. Use Next.js Server Actions for all database mutations.
> 3.  **Database:** The Drizzle schema must be centralized in `src/db/schema.ts` (or split logically within `src/db/schema/`).
> 
> **Task 1: Generate the Scaffolding Code**
> Please provide the following to initialize this project:
> 
> **1. The Optimal Directory Tree:** Print a markdown tree of the `src/` directory showing the feature-based structure (including global components, db, lib, and features like `attendance` and `academics`).
> **2. Root Providers Setup:** Write the code for `src/components/providers.tsx`. This must initialize the `QueryClient` for TanStack Query and wrap the children. 
> **3. Root Layout:** Write `app/layout.tsx` to include the `Providers` component, the `Toaster` from `sonner`, and the basic Inter font configuration.
> **4. Drizzle Configuration:** Write the `drizzle.config.ts` and `src/db/index.ts` setup for a Neon PostgreSQL connection.
> **5. Base UI:** Provide the terminal commands required to initialize this Next.js project, install the specified dependencies, and init `shadcn/ui`.

***

### Why this prompt works perfectly for your MVP:

1. **Feature-Based Modularization (`src/features/*`)**:
   Instead of a messy folder where a generic "Button" sits next to a highly specific "StudentAttendanceTable", this prompt forces the AI to group code by your User Stories. 
   * `src/features/attendance/components/...`
   * `src/features/attendance/actions/...` (Server actions for attendance)
   * This makes your 13-week timeline much easier to manage because you work on one folder at a time.
2. **TanStack Query + Server Actions Synergy**: 
   The prompt specifically instructs the AI on the modern Next.js 14 paradigm. You use Server Actions to *write* data (e.g., `markStudentAbsent()`), and TanStack Query on the client to *cache and instantly update* the UI so the teacher doesn't have to refresh the page.
3. **Sonner Integration**: `shadcn/ui` comes with a default toaster, but Sonner is vastly superior for Next.js. This prompt ensures the AI sets it up at the root layout right from day one.

Once the AI generates this scaffolding, you will have a rock-solid, production-ready foundation. 

Would you like the next prompt to focus on scaffolding the **Authentication & RBAC (Role-Based Access Control) Middleware**, or should we create a prompt for the **Database Schema implementation** based on our earlier TDR?