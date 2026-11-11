-- ==============================================================================
-- Migration: Create ai_models table & link projects.ai_model_id + projects.ai_api_key
-- Safe Step 1 (Additive + Automatic Backfill; legacy columns & global_settings kept until verified)
-- ==============================================================================

-- 1. Create ai_models catalog & pricing table
CREATE TABLE IF NOT EXISTS public.ai_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL CHECK (provider IN ('openai', 'gemini')) DEFAULT 'openai',
    cost_1_ref NUMERIC(10, 4) NOT NULL DEFAULT 0.06,
    cost_2_refs NUMERIC(10, 4) NOT NULL DEFAULT 0.08,
    cost_3_plus_refs NUMERIC(10, 4) NOT NULL DEFAULT 0.10,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure at most one model is marked as default
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_models_single_default
    ON public.ai_models (is_default)
    WHERE is_default = true;

-- 2. Add ai_model_id & per-project ai_api_key to projects, and enforce >= 1 reference images
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS ai_model_id UUID REFERENCES public.ai_models(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS ai_api_key TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_projects_ai_model
    ON public.projects(ai_model_id);

UPDATE public.projects
SET reference_images_count = 1
WHERE reference_images_count IS NULL OR reference_images_count < 1;

ALTER TABLE public.projects
    ALTER COLUMN reference_images_count SET DEFAULT 1;

-- 3. Row Level Security & Policies for ai_models
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read ai_models" ON public.ai_models;
DROP POLICY IF EXISTS "Admins manage ai_models" ON public.ai_models;

CREATE POLICY "Authenticated read ai_models"
    ON public.ai_models
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins manage ai_models"
    ON public.ai_models
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

GRANT ALL ON TABLE public.ai_models TO authenticated, service_role;

-- 4. Atomic RPC to switch default AI model safely
CREATE OR REPLACE FUNCTION public.set_default_ai_model(target_id UUID)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can change the default AI model';
    END IF;

    UPDATE public.ai_models
    SET is_default = false,
        updated_at = timezone('utc'::text, now())
    WHERE is_default = true AND id <> target_id;

    UPDATE public.ai_models
    SET is_default = true,
        updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.set_default_ai_model(UUID) TO authenticated, service_role;

-- 5. Automatically backfill ai_models from global_settings.cost_settings and link projects
DO $$
DECLARE
    cost_item JSONB;
    proj RECORD;
    m_name TEXT;
    m_provider TEXT;
    c1 NUMERIC(10, 4);
    c2 NUMERIC(10, 4);
    c3 NUMERIC(10, 4);
    default_model_id UUID;
    matched_model_id UUID;
    matched_provider TEXT;
    extracted_key TEXT;
    has_gs BOOLEAN;
BEGIN
    -- 5a. Import models from global_settings.cost_settings if global_settings exists
    SELECT to_regclass('public.global_settings') IS NOT NULL INTO has_gs;

    IF has_gs THEN
        FOR cost_item IN
            SELECT jsonb_array_elements(COALESCE(cost_settings, '[]'::jsonb))
            FROM public.global_settings
            WHERE id = 'current'
        LOOP
            m_name := TRIM(COALESCE(cost_item->>'modelName', cost_item->>'id', ''));
            IF m_name = '' THEN
                CONTINUE;
            END IF;

            m_provider := CASE
                WHEN LOWER(m_name) LIKE '%gemini%' THEN 'gemini'
                ELSE 'openai'
            END;

            c1 := COALESCE((cost_item->>'ref1')::numeric, 0.06);
            c2 := COALESCE((cost_item->>'ref2')::numeric, 0.08);
            c3 := COALESCE((cost_item->>'ref3')::numeric, 0.10);

            INSERT INTO public.ai_models (name, provider, cost_1_ref, cost_2_refs, cost_3_plus_refs, is_default)
            VALUES (
                m_name,
                m_provider,
                c1,
                c2,
                c3,
                NOT EXISTS (SELECT 1 FROM public.ai_models WHERE is_default = true)
            )
            ON CONFLICT (name) DO NOTHING;
        END LOOP;
    END IF;

    -- 5b. Seed default catalog if ai_models is still empty
    IF NOT EXISTS (SELECT 1 FROM public.ai_models) THEN
        INSERT INTO public.ai_models (name, provider, cost_1_ref, cost_2_refs, cost_3_plus_refs, is_default)
        VALUES
            ('gpt-image-2.6-flare', 'openai', 0.06, 0.08, 0.10, true),
            ('gpt-image-2.5-flare', 'openai', 0.05, 0.065, 0.08, false),
            ('gpt-image-2', 'openai', 0.045, 0.06, 0.075, false),
            ('gemini-nano-banana-2.1', 'gemini', 0.03, 0.04, 0.05, false)
        ON CONFLICT (name) DO NOTHING;
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

        IF default_model_id IS NOT NULL THEN
            UPDATE public.ai_models SET is_default = true WHERE id = default_model_id;
        END IF;
    END IF;

    -- 5c. Link every project's ai_model_id & backfill per-project ai_api_key
    FOR proj IN
        SELECT id, selected_ai_model, operator_settings, ai_model_id, ai_api_key
        FROM public.projects
    LOOP
        m_name := TRIM(COALESCE(
            NULLIF(TRIM(proj.selected_ai_model), ''),
            NULLIF(TRIM(proj.operator_settings->>'openaiModel'), ''),
            ''
        ));

        matched_model_id := proj.ai_model_id;

        IF matched_model_id IS NULL AND m_name <> '' THEN
            SELECT id INTO matched_model_id
            FROM public.ai_models
            WHERE LOWER(TRIM(name)) = LOWER(m_name)
            LIMIT 1;

            -- If a project had a custom model name not in cost_settings, preserve it in ai_models
            IF matched_model_id IS NULL THEN
                m_provider := CASE
                    WHEN LOWER(m_name) LIKE '%gemini%' THEN 'gemini'
                    ELSE 'openai'
                END;

                INSERT INTO public.ai_models (name, provider, cost_1_ref, cost_2_refs, cost_3_plus_refs, is_default)
                VALUES (m_name, m_provider, 0.06, 0.08, 0.10, false)
                RETURNING id INTO matched_model_id;
            END IF;
        END IF;

        IF matched_model_id IS NULL THEN
            matched_model_id := default_model_id;
        END IF;

        SELECT provider INTO matched_provider
        FROM public.ai_models
        WHERE id = matched_model_id;

        extracted_key := COALESCE(NULLIF(TRIM(proj.ai_api_key), ''), '');
        IF extracted_key = '' THEN
            IF matched_provider = 'gemini' THEN
                extracted_key := COALESCE(
                    NULLIF(TRIM(proj.operator_settings->>'geminiApiKey'), ''),
                    NULLIF(TRIM(proj.operator_settings->>'openaiApiKey'), ''),
                    ''
                );
            ELSE
                extracted_key := COALESCE(
                    NULLIF(TRIM(proj.operator_settings->>'openaiApiKey'), ''),
                    NULLIF(TRIM(proj.operator_settings->>'geminiApiKey'), ''),
                    ''
                );
            END IF;
        END IF;

        UPDATE public.projects
        SET ai_model_id = matched_model_id,
            ai_api_key = extracted_key
        WHERE id = proj.id;
    END LOOP;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

