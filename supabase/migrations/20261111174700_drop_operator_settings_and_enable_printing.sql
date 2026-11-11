-- ==============================================================================
-- Migration: Drop projects.enable_printing & projects.operator_settings
-- Local booth hardware/UX settings (printer, camera, timers, kiosk lock, image quality,
-- viewer URL) are managed 100% locally on each booth; backend tracks cloud config & counters.
-- ==============================================================================

-- 1. Safety guard: if operator_settings still exists and any project has an empty ai_api_key,
--    rescue any API key from operator_settings before dropping the column.
DO $$
DECLARE
    proj RECORD;
    provider_name TEXT;
    rescued_key TEXT;
    has_op_col BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'projects'
          AND column_name = 'operator_settings'
    ) INTO has_op_col;

    IF has_op_col THEN
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
    END IF;
END $$;

-- 2. Drop redundant enable_printing and operator_settings columns from public.projects
ALTER TABLE public.projects
    DROP COLUMN IF EXISTS enable_printing,
    DROP COLUMN IF EXISTS operator_settings;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

