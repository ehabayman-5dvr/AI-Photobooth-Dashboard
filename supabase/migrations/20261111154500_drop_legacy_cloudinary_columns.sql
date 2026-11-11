-- ==============================================================================
-- Migration: Drop Redundant Cloudinary Credential Columns (Step 2 Cleanup)
-- Prerequisite: 20261111153000_create_cloudinary_accounts.sql applied & verified
-- ==============================================================================

-- 1. Safety guard: verify cloudinary_accounts exists and link any remaining unlinked projects
DO $$
DECLARE
    default_acc_id UUID;
BEGIN
    IF to_regclass('public.cloudinary_accounts') IS NULL THEN
        RAISE EXCEPTION 'Aborted: public.cloudinary_accounts does not exist. Run 20261111153000_create_cloudinary_accounts.sql first.';
    END IF;

    SELECT id INTO default_acc_id
    FROM public.cloudinary_accounts
    WHERE is_default = true
    LIMIT 1;

    IF default_acc_id IS NULL THEN
        SELECT id INTO default_acc_id
        FROM public.cloudinary_accounts
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    IF default_acc_id IS NOT NULL THEN
        UPDATE public.projects
        SET cloudinary_account_id = default_acc_id
        WHERE cloudinary_account_id IS NULL;
    END IF;
END $$;

-- 2. Strip duplicated Cloudinary credentials from projects.operator_settings JSONB
UPDATE public.projects
SET operator_settings = COALESCE(operator_settings, '{}'::jsonb)
    - 'cloudinaryCloudName'
    - 'cloudinaryApiKey'
    - 'cloudinaryApiSecret'
WHERE operator_settings ?| ARRAY['cloudinaryCloudName', 'cloudinaryApiKey', 'cloudinaryApiSecret'];

-- 3. Drop redundant credential columns from public.projects
ALTER TABLE public.projects
    DROP COLUMN IF EXISTS cloudinary_cloud_name,
    DROP COLUMN IF EXISTS cloudinary_api_key,
    DROP COLUMN IF EXISTS cloudinary_api_secret;

-- 4. Drop redundant credential columns from public.global_settings
ALTER TABLE public.global_settings
    DROP COLUMN IF EXISTS cloudinary_cloud_name,
    DROP COLUMN IF EXISTS cloudinary_api_key,
    DROP COLUMN IF EXISTS cloudinary_api_secret;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

