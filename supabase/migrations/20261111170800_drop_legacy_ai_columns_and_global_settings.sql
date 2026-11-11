-- ==============================================================================
-- Migration: Drop Redundant AI Model Columns & Obsolete global_settings Table (Step 2 Cleanup)
-- Prerequisite: 20261111163500_create_ai_models.sql applied & verified
-- ==============================================================================

-- 1. Safety guard: verify ai_models exists, ensure all projects have ai_model_id linked
--    and rescue any remaining API keys from operator_settings before stripping JSONB keys
DO $$
DECLARE
    default_model_id UUID;
    proj RECORD;
    provider_name TEXT;
    rescued_key TEXT;
BEGIN
    IF to_regclass('public.ai_models') IS NULL THEN
        RAISE EXCEPTION 'Aborted: public.ai_models does not exist. Run 20261111163500_create_ai_models.sql first.';
    END IF;

    SELECT id INTO default_model_id
    FROM public.ai_models
    WHERE is_default = true
    LIMIT 1;

    IF default_model_id IS NULL THEN
        SELECT id INTO default_model_id
        FROM public.ai_models
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    IF default_model_id IS NOT NULL THEN
        UPDATE public.projects
        SET ai_model_id = default_model_id
        WHERE ai_model_id IS NULL;
    END IF;

    -- Rescue any API key still sitting only inside operator_settings
    FOR proj IN
        SELECT p.id, p.ai_api_key, p.operator_settings, m.provider
        FROM public.projects p
        LEFT JOIN public.ai_models m ON m.id = p.ai_model_id
        WHERE COALESCE(TRIM(p.ai_api_key), '') = ''
          AND p.operator_settings ?| ARRAY['openaiApiKey', 'geminiApiKey']
    LOOP
        provider_name := COALESCE(proj.provider, 'openai');
        IF provider_name = 'gemini' THEN
            rescued_key := COALESCE(
                NULLIF(TRIM(proj.operator_settings->>'geminiApiKey'), ''),
                NULLIF(TRIM(proj.operator_settings->>'openaiApiKey'), ''),
                ''
            );
        ELSE
            rescued_key := COALESCE(
                NULLIF(TRIM(proj.operator_settings->>'openaiApiKey'), ''),
                NULLIF(TRIM(proj.operator_settings->>'geminiApiKey'), ''),
                ''
            );
        END IF;

        IF rescued_key <> '' THEN
            UPDATE public.projects
            SET ai_api_key = rescued_key
            WHERE id = proj.id;
        END IF;
    END LOOP;

    -- Ensure reference_images_count >= 1 across all projects
    UPDATE public.projects
    SET reference_images_count = 1
    WHERE reference_images_count IS NULL OR reference_images_count < 1;
END $$;

-- 2. Strip duplicated AI keys & model fields from projects.operator_settings JSONB
UPDATE public.projects
SET operator_settings = COALESCE(operator_settings, '{}'::jsonb)
    - 'openaiApiKey'
    - 'geminiApiKey'
    - 'openaiModel'
    - 'aiModelsList'
WHERE operator_settings ?| ARRAY['openaiApiKey', 'geminiApiKey', 'openaiModel', 'aiModelsList'];

-- 3. Drop redundant AI model columns from public.projects
ALTER TABLE public.projects
    DROP COLUMN IF EXISTS ai_models_list,
    DROP COLUMN IF EXISTS selected_ai_model;

-- 4. Drop obsolete public.global_settings table (Cloudinary accounts & AI models now have dedicated tables)
DROP TABLE IF EXISTS public.global_settings CASCADE;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

