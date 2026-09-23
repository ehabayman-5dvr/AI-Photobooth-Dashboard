---
name: photobooth-db
description: >-
  Manage, migrate, verify, and troubleshoot the Supabase PostgreSQL database for the AI Photobooth Dashboard.
  Use when creating or updating database schemas, managing user whitelists, verifying RLS policies, or testing RPC endpoints.
---

# Photobooth Database Management Skill

This skill guides agents through database workflows for the AI Photobooth Dashboard project.

---

## 1. Quick Verification

Always verify the state of the database before and after performing schema or configuration changes:

```bash
node --env-file=.env.local scripts/verify-supabase.js
```

This script verifies:
1. All required tables exist (`allowed_users`, `profiles`, `global_settings`, `projects`, `project_members`, `usage_logs`).
2. Row Level Security (RLS) is active and accessible.
3. The Super Admin email is present in `allowed_users` and linked in `profiles`.
4. Global settings row `current` exists.

---

## 2. Managing Whitelisted Users

### Adding a User to the Whitelist via Node/Supabase Client

```bash
node --env-file=.env.local -e "
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function addWhitelist(email, role = 'REGULAR') {
  const { data, error } = await supabase
    .from('allowed_users')
    .upsert({ email: email.toLowerCase().trim(), role })
    .select();
  if (error) console.error('Error:', error);
  else console.log('Successfully whitelisted:', data);
}

addWhitelist('user@example.com', 'ADMIN');
"
```

### Direct SQL Whitelisting & Role Update

```sql
INSERT INTO public.allowed_users (email, role)
VALUES ('user@example.com', 'ADMIN')
ON CONFLICT (email) DO UPDATE SET role = 'ADMIN';

-- If the user has already signed in, update their profile role directly:
UPDATE public.profiles
SET role = 'ADMIN', updated_at = NOW()
WHERE LOWER(email) = LOWER('user@example.com');
```

---

## 3. Applying Database Schema Changes

When modifying schemas:

1. Update the master schema file: [`supabase/schema.sql`](../../supabase/schema.sql).
2. Create an incremental migration file in `supabase/migrations/<YYYYMMDDHHMMSS>_<description>.sql`.
3. To apply via Supabase Dashboard:
   - Open: `https://supabase.com/dashboard/project/<project-ref>/sql/new`
   - Paste the SQL script and execute.
4. Run `node --env-file=.env.local scripts/verify-supabase.js` to ensure the change is healthy.

---

## 4. Key Database Patterns to Preserve

- **RLS Recursion Prevention**:
  Never query `public.profiles` inside a policy on `public.profiles`. Use the `public.is_admin()` security definer function instead.
- **Atomic Counters**:
  Generation counts must use the RPC function `increment_project_usage(p_id, p_amount)` to avoid race conditions.
- **Two-Way Auth Sync**:
  Maintain both `on_auth_user_created` (triggered by Google sign-in) and `on_allowed_user_inserted_or_updated` (triggered by whitelist addition) so profiles always stay in sync regardless of whether the user signs up before or after being whitelisted.
