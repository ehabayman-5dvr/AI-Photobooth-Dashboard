-- ==============================================================================
-- AI Photobooth Dashboard - Database Schema & Initial Setup
-- Target Project: https://mtnpmhvshxswzycdvafo.supabase.co
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ALLOWED USERS (WHITELIST)
CREATE TABLE IF NOT EXISTS public.allowed_users (
    email TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'REGULAR')) DEFAULT 'REGULAR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'REGULAR')) DEFAULT 'REGULAR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. GLOBAL SETTINGS
CREATE TABLE IF NOT EXISTS public.global_settings (
    id TEXT PRIMARY KEY DEFAULT 'current',
    cloudinary_cloud_name TEXT DEFAULT '',
    cloudinary_api_key TEXT DEFAULT '',
    cloudinary_api_secret TEXT DEFAULT '',
    cost_settings JSONB NOT NULL DEFAULT '[{"id": "gpt-image-2.6-flare", "modelName": "gpt-image-2.6-flare", "promptOnly": 0.04, "ref1": 0.06, "ref2": 0.08, "ref3": 0.10}, {"id": "gpt-image-2.5-flare", "modelName": "gpt-image-2.5-flare", "promptOnly": 0.035, "ref1": 0.05, "ref2": 0.065, "ref3": 0.08}, {"id": "gpt-image-2", "modelName": "gpt-image-2", "promptOnly": 0.03, "ref1": 0.045, "ref2": 0.06, "ref3": 0.075}, {"id": "gemini-nano-banana-2.1", "modelName": "gemini-nano-banana-2.1", "promptOnly": 0.02, "ref1": 0.03, "ref2": 0.04, "ref3": 0.05}]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. PROJECTS
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    max_usage INTEGER NOT NULL DEFAULT 1000,
    total_usage INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    project_type TEXT NOT NULL CHECK (project_type IN ('desktop', 'web')) DEFAULT 'desktop',
    cloudinary_cloud_name TEXT,
    cloudinary_api_key TEXT,
    cloudinary_api_secret TEXT,
    cloudinary_tag TEXT,
    cloudinary_folder TEXT,
    ai_models_list JSONB NOT NULL DEFAULT '["gpt-image-2.6-flare", "gpt-image-2.5-flare", "gpt-image-2", "gemini-nano-banana-2.1"]'::jsonb,
    selected_ai_model TEXT NOT NULL DEFAULT 'gpt-image-2.6-flare',
    reference_images_count INTEGER NOT NULL DEFAULT 0,
    enable_printing BOOLEAN NOT NULL DEFAULT true,
    total_printed_copies INTEGER NOT NULL DEFAULT 0,
    operator_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. PROJECT MEMBERS
CREATE TABLE IF NOT EXISTS public.project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(project_id, user_id)
);

-- 7. USAGE LOGS
CREATE TABLE IF NOT EXISTS public.usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL DEFAULT 1,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects(created_by);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_project_timestamp ON public.usage_logs(project_id, timestamp);

-- ==============================================================================
-- 8. HELPER FUNCTIONS & RPC
-- ==============================================================================

-- Security definer check if authenticated user is ADMIN
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'ADMIN'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- RPC: Increment Project Usage
CREATE OR REPLACE FUNCTION public.increment_project_usage(p_id UUID, p_amount INTEGER DEFAULT 1)
RETURNS VOID AS $$
BEGIN
    UPDATE public.projects
    SET total_usage = COALESCE(total_usage, 0) + p_amount,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Increment Project Prints
CREATE OR REPLACE FUNCTION public.increment_project_prints(p_id UUID, p_copies INTEGER DEFAULT 1)
RETURNS VOID AS $$
BEGIN
    UPDATE public.projects
    SET total_printed_copies = COALESCE(total_printed_copies, 0) + p_copies,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 9. AUTH TRIGGERS FOR PROFILES & WHITELIST SYNC
-- ==============================================================================

-- Function: Handle user signup/login from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    matched_role TEXT;
BEGIN
    -- Check if user's email exists in allowed_users
    SELECT role INTO matched_role
    FROM public.allowed_users
    WHERE LOWER(email) = LOWER(NEW.email)
    LIMIT 1;

    -- If email is in allowed_users, create or update profile
    IF matched_role IS NOT NULL THEN
        INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
        VALUES (
            NEW.id,
            NEW.email,
            COALESCE(
                NEW.raw_user_meta_data->>'full_name',
                NEW.raw_user_meta_data->>'name',
                split_part(NEW.email, '@', 1)
            ),
            NEW.raw_user_meta_data->>'avatar_url',
            matched_role
        )
        ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
            avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
            role = matched_role,
            updated_at = timezone('utc'::text, now());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function: When an email is added or updated in allowed_users, sync with auth.users if already exists
CREATE OR REPLACE FUNCTION public.handle_allowed_user_change()
RETURNS TRIGGER AS $$
DECLARE
    auth_user RECORD;
BEGIN
    SELECT id, email, raw_user_meta_data INTO auth_user
    FROM auth.users
    WHERE LOWER(email) = LOWER(NEW.email)
    LIMIT 1;

    IF auth_user.id IS NOT NULL THEN
        INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
        VALUES (
            auth_user.id,
            auth_user.email,
            COALESCE(
                auth_user.raw_user_meta_data->>'full_name',
                auth_user.raw_user_meta_data->>'name',
                split_part(auth_user.email, '@', 1)
            ),
            auth_user.raw_user_meta_data->>'avatar_url',
            NEW.role
        )
        ON CONFLICT (id) DO UPDATE
        SET role = NEW.role,
            updated_at = timezone('utc'::text, now());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_allowed_user_inserted_or_updated ON public.allowed_users;
CREATE TRIGGER on_allowed_user_inserted_or_updated
    AFTER INSERT OR UPDATE ON public.allowed_users
    FOR EACH ROW EXECUTE FUNCTION public.handle_allowed_user_change();

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.allowed_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- Allowed Users Policies
DROP POLICY IF EXISTS "Admins can manage allowed_users" ON public.allowed_users;
DROP POLICY IF EXISTS "Authenticated can view allowed_users" ON public.allowed_users;

CREATE POLICY "Admins can manage allowed_users"
    ON public.allowed_users
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated can view allowed_users"
    ON public.allowed_users
    FOR SELECT
    TO authenticated
    USING (true);

-- Profiles Policies
DROP POLICY IF EXISTS "Public profiles read" ON public.profiles;
DROP POLICY IF EXISTS "Self profile update" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;

CREATE POLICY "Public profiles read"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Self profile update"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid() OR public.is_admin())
    WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins can delete profiles"
    ON public.profiles
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- Global Settings Policies (read by everyone/anon, edit by admin)
DROP POLICY IF EXISTS "Public read global settings" ON public.global_settings;
DROP POLICY IF EXISTS "Admins update global settings" ON public.global_settings;

CREATE POLICY "Public read global settings"
    ON public.global_settings
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Admins update global settings"
    ON public.global_settings
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Projects Policies
DROP POLICY IF EXISTS "Read projects" ON public.projects;
DROP POLICY IF EXISTS "Admins insert projects" ON public.projects;
DROP POLICY IF EXISTS "Update projects" ON public.projects;
DROP POLICY IF EXISTS "Admins delete projects" ON public.projects;

CREATE POLICY "Read projects"
    ON public.projects
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_members.project_id = projects.id
            AND project_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Admins insert projects"
    ON public.projects
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin() OR created_by = auth.uid());

CREATE POLICY "Update projects"
    ON public.projects
    FOR UPDATE
    TO authenticated
    USING (public.is_admin() OR created_by = auth.uid())
    WITH CHECK (public.is_admin() OR created_by = auth.uid());

CREATE POLICY "Admins delete projects"
    ON public.projects
    FOR DELETE
    TO authenticated
    USING (public.is_admin() OR created_by = auth.uid());

-- Project Members Policies
DROP POLICY IF EXISTS "Read project members" ON public.project_members;
DROP POLICY IF EXISTS "Admins manage project members" ON public.project_members;

CREATE POLICY "Read project members"
    ON public.project_members
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins manage project members"
    ON public.project_members
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Usage Logs Policies
DROP POLICY IF EXISTS "Read usage logs" ON public.usage_logs;
DROP POLICY IF EXISTS "Insert usage logs" ON public.usage_logs;

CREATE POLICY "Read usage logs"
    ON public.usage_logs
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Insert usage logs"
    ON public.usage_logs
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- ==============================================================================
-- 11. GRANT PERMISSIONS
-- ==============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- ==============================================================================
-- 12. INITIAL DATA SEEDING
-- ==============================================================================

-- 12.1 Default Global Settings Row
INSERT INTO public.global_settings (id, cloudinary_cloud_name, cloudinary_api_key, cloudinary_api_secret)
VALUES ('current', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- 12.2 Whitelist Initial Super Admin
INSERT INTO public.allowed_users (email, role)
VALUES ('ehab.ayman.gh@gmail.com', 'ADMIN')
ON CONFLICT (email) DO UPDATE SET role = 'ADMIN';

-- 12.3 Sync with existing auth user if already registered
DO $$
DECLARE
    existing_user RECORD;
BEGIN
    SELECT id, email, raw_user_meta_data INTO existing_user
    FROM auth.users
    WHERE LOWER(email) = 'ehab.ayman.gh@gmail.com'
    LIMIT 1;

    IF existing_user.id IS NOT NULL THEN
        INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
        VALUES (
            existing_user.id,
            existing_user.email,
            COALESCE(
                existing_user.raw_user_meta_data->>'full_name',
                existing_user.raw_user_meta_data->>'name',
                'Ehab Ayman'
            ),
            existing_user.raw_user_meta_data->>'avatar_url',
            'ADMIN'
        )
        ON CONFLICT (id) DO UPDATE
        SET role = 'ADMIN',
            updated_at = timezone('utc'::text, now());
    END IF;
END $$;
