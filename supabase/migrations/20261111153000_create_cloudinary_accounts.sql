-- ==============================================================================
-- Migration: Create cloudinary_accounts table & link projects.cloudinary_account_id
-- Safe Phase 1 (Additive + Automatic Backfill; legacy columns kept until verified)
-- ==============================================================================

-- 1. Create cloudinary_accounts table
CREATE TABLE IF NOT EXISTS public.cloudinary_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    cloud_name TEXT NOT NULL,
    api_key TEXT NOT NULL,
    api_secret TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- At most one account can be marked as the default at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_cloudinary_accounts_single_default
    ON public.cloudinary_accounts (is_default)
    WHERE is_default = true;

-- 2. Add cloudinary_account_id foreign key to projects (RESTRICT prevents deleting accounts in use)
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS cloudinary_account_id UUID
    REFERENCES public.cloudinary_accounts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_projects_cloudinary_account
    ON public.projects(cloudinary_account_id);

-- 3. Row Level Security & Policies for cloudinary_accounts
ALTER TABLE public.cloudinary_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read cloudinary_accounts" ON public.cloudinary_accounts;
DROP POLICY IF EXISTS "Admins manage cloudinary_accounts" ON public.cloudinary_accounts;

CREATE POLICY "Authenticated read cloudinary_accounts"
    ON public.cloudinary_accounts
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins manage cloudinary_accounts"
    ON public.cloudinary_accounts
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

GRANT ALL ON TABLE public.cloudinary_accounts TO authenticated, service_role;

-- 4. Atomic RPC to switch default Cloudinary account safely
CREATE OR REPLACE FUNCTION public.set_default_cloudinary_account(target_id UUID)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can change the default Cloudinary account';
    END IF;

    UPDATE public.cloudinary_accounts
    SET is_default = false,
        updated_at = timezone('utc'::text, now())
    WHERE is_default = true AND id <> target_id;

    UPDATE public.cloudinary_accounts
    SET is_default = true,
        updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.set_default_cloudinary_account(UUID) TO authenticated, service_role;

-- 5. Automatically backfill existing credentials from global_settings & projects
DO $$
DECLARE
    gs RECORD;
    proj RECORD;
    default_acc_id UUID;
    matched_acc_id UUID;
    p_cloud TEXT;
    p_key TEXT;
    p_secret TEXT;
BEGIN
    -- 5a. Import global_settings credentials as the Default account if present
    SELECT cloudinary_cloud_name, cloudinary_api_key, cloudinary_api_secret
    INTO gs
    FROM public.global_settings
    WHERE id = 'current'
    LIMIT 1;

    IF gs IS NOT NULL
       AND TRIM(COALESCE(gs.cloudinary_cloud_name, '')) <> ''
       AND TRIM(COALESCE(gs.cloudinary_api_key, '')) <> ''
       AND TRIM(COALESCE(gs.cloudinary_api_secret, '')) <> '' THEN

        SELECT id INTO default_acc_id
        FROM public.cloudinary_accounts
        WHERE LOWER(TRIM(cloud_name)) = LOWER(TRIM(gs.cloudinary_cloud_name))
        LIMIT 1;

        IF default_acc_id IS NULL THEN
            INSERT INTO public.cloudinary_accounts (label, cloud_name, api_key, api_secret, is_default)
            VALUES (
                'Default (' || TRIM(gs.cloudinary_cloud_name) || ')',
                TRIM(gs.cloudinary_cloud_name),
                TRIM(gs.cloudinary_api_key),
                TRIM(gs.cloudinary_api_secret),
                NOT EXISTS (SELECT 1 FROM public.cloudinary_accounts WHERE is_default = true)
            )
            RETURNING id INTO default_acc_id;
        END IF;
    END IF;

    -- Ensure default_acc_id holds whichever account is currently default
    IF default_acc_id IS NULL THEN
        SELECT id INTO default_acc_id
        FROM public.cloudinary_accounts
        WHERE is_default = true
        LIMIT 1;
    END IF;

    -- 5b. Import any distinct per-project credentials and link all projects
    FOR proj IN
        SELECT id, name, cloudinary_cloud_name, cloudinary_api_key, cloudinary_api_secret, operator_settings, cloudinary_account_id
        FROM public.projects
    LOOP
        IF proj.cloudinary_account_id IS NOT NULL THEN
            CONTINUE;
        END IF;

        p_cloud := TRIM(COALESCE(
            NULLIF(TRIM(proj.cloudinary_cloud_name), ''),
            NULLIF(TRIM(proj.operator_settings->>'cloudinaryCloudName'), ''),
            ''
        ));
        p_key := TRIM(COALESCE(
            NULLIF(TRIM(proj.cloudinary_api_key), ''),
            NULLIF(TRIM(proj.operator_settings->>'cloudinaryApiKey'), ''),
            ''
        ));
        p_secret := TRIM(COALESCE(
            NULLIF(TRIM(proj.cloudinary_api_secret), ''),
            NULLIF(TRIM(proj.operator_settings->>'cloudinaryApiSecret'), ''),
            ''
        ));

        matched_acc_id := NULL;

        IF p_cloud <> '' THEN
            SELECT id INTO matched_acc_id
            FROM public.cloudinary_accounts
            WHERE LOWER(TRIM(cloud_name)) = LOWER(p_cloud)
            LIMIT 1;

            IF matched_acc_id IS NULL AND p_key <> '' AND p_secret <> '' THEN
                INSERT INTO public.cloudinary_accounts (label, cloud_name, api_key, api_secret, is_default)
                VALUES (
                    proj.name || ' (' || p_cloud || ')',
                    p_cloud,
                    p_key,
                    p_secret,
                    NOT EXISTS (SELECT 1 FROM public.cloudinary_accounts WHERE is_default = true)
                )
                RETURNING id INTO matched_acc_id;

                IF default_acc_id IS NULL THEN
                    default_acc_id := matched_acc_id;
                END IF;
            END IF;
        END IF;

        IF matched_acc_id IS NULL THEN
            matched_acc_id := default_acc_id;
        END IF;

        IF matched_acc_id IS NOT NULL THEN
            UPDATE public.projects
            SET cloudinary_account_id = matched_acc_id
            WHERE id = proj.id;
        END IF;
    END LOOP;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

