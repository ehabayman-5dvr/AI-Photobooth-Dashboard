# AI Photobooth Console - Agent Instructions & Architecture Guidelines

This file defines the architecture, conventions, and rules for agents and developers working on the AI Photobooth Dashboard repository.

---

## 1. Project Overview & Architecture

- **Stack**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Supabase (PostgreSQL 15+, Auth, RLS, Stored Procedures), Cloudinary v2 SDK.
- **Port**: The development server is configured to run on port `4000` (`npm run dev -p 4000`).
- **Data Flow**:
  - Browser UI queries Supabase directly via `@supabase/supabase-js` using `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - Database access is strictly governed by PostgreSQL Row Level Security (RLS) policies.
  - Server Route Handlers (`app/api/...`) that require elevated permissions (e.g., generation tracking) instantiate an admin client with `SUPABASE_SERVICE_ROLE_KEY`.

---

## 2. Authentication & Authorization Patterns

### Whitelist Architecture
- Sign-in is handled exclusively through **Google OAuth**.
- The system is **invite-only**. A user can only log in if their email address is present in `public.allowed_users`.
- When an account authenticates with Google:
  - The PostgreSQL trigger `on_auth_user_created` evaluates `allowed_users`.
  - If whitelisted, a corresponding `public.profiles` record is created or updated with the designated `role` (`ADMIN` or `REGULAR`).
  - If not whitelisted, no profile is created, and the client displays the access-denied verification screen (`components/ClientRootLayout.tsx`).

### Roles (`UserRole` in `types.ts`)
- `ADMIN`:
  - Access to `/users` (Whitelist & active profile management).
  - Access to `/settings` (Global Cloudinary configuration).
  - Can create, edit, delete any project and manage project team members.
  - Can see aggregate metrics for all projects.
- `REGULAR`:
  - Limited to assigned projects (either created by them or mapped in `project_members`).
  - Cannot access `/users` or `/settings`.

---

## 3. Database Conventions & Supabase Rules

### Client vs Service Role
- **Client Components**: Always import `supabase` from `@/utils/supabase` (uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- **Server API Routes**: When writing to protected audit logs or executing privileged operations, create an internal admin client with `SUPABASE_SERVICE_ROLE_KEY`. Never expose the service role key to the browser.

### RLS Policies
- Every table in `public` **must** have Row Level Security enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
- To prevent RLS infinite recursion when checking admin status, use the `public.is_admin()` security definer function rather than querying `profiles` directly inside a policy on `profiles`.

### Stored Procedures (RPC)
- For atomic counters or multi-step transactional updates, use stored procedures (such as `increment_project_usage(p_id, p_amount)`).

### Migrations
- Keep consolidated schemas in `supabase/schema.sql`.
- Place incremental migrations in `supabase/migrations/<timestamp>_<name>.sql`.
- Always verify database health after any schema change by running:
  ```bash
  node --env-file=.env.local scripts/verify-supabase.js
  ```

---

## 4. Cloudinary Integration Conventions

- Global credentials (`cloudinaryCloudName`, `cloudinaryApiKey`, `cloudinaryApiSecret`) are stored in `public.global_settings` (row `id = 'current'`).
- Projects can optionally override Cloudinary credentials on a per-project basis, but default to the global settings fallback.
- Asset queries are grouped by `cloudinary_tag` (which maps to tags or folder structures in Cloudinary).
- The `Featured` tag is used to pin select images to the curated featured gallery.

---

## 5. Coding & Workflow Standards

1. **Strict TypeScript**: Do not introduce `any` where interfaces exist in `types.ts`.
2. **Next.js App Router**: Client components must declare `'use client'` at the very top.
3. **Build Validation**: Always verify `npm run build` passes before submitting pull requests or concluding complex tasks.
4. **Environment Variables**: Never hardcode credentials. Reference `.env.local` variables.
