-- ==============================================================================
-- Migration: Add Project Settings, Platform Type, AI Models, Printing & Operator Settings
-- ==============================================================================

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL CHECK (project_type IN ('desktop', 'web')) DEFAULT 'desktop',
    ADD COLUMN IF NOT EXISTS cloudinary_folder TEXT,
    ADD COLUMN IF NOT EXISTS ai_models_list JSONB NOT NULL DEFAULT '["gpt-image-2.6-flare", "gpt-image-2.5-flare", "gpt-image-2", "gemini-nano-banana-2.1"]'::jsonb,
    ADD COLUMN IF NOT EXISTS selected_ai_model TEXT NOT NULL DEFAULT 'gpt-image-2.6-flare',
    ADD COLUMN IF NOT EXISTS enable_printing BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS total_printed_copies INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS operator_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill cloudinary_folder from cloudinary_tag if empty
UPDATE public.projects
SET cloudinary_folder = cloudinary_tag
WHERE cloudinary_folder IS NULL AND cloudinary_tag IS NOT NULL;

-- RPC: Increment Project Prints Atomically
CREATE OR REPLACE FUNCTION public.increment_project_prints(p_id UUID, p_copies INTEGER DEFAULT 1)
RETURNS VOID AS $$
BEGIN
    UPDATE public.projects
    SET total_printed_copies = COALESCE(total_printed_copies, 0) + p_copies,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT ALL ON FUNCTION public.increment_project_prints(UUID, INTEGER) TO anon, authenticated, service_role;

-- Reload PostgREST schema cache so the new columns & RPC are immediately available to the API
NOTIFY pgrst, 'reload schema';


