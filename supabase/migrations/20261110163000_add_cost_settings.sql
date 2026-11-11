-- ==============================================================================
-- Migration: Add Cost Settings to Global Settings and Reference Images / Test Flag to Projects
-- ==============================================================================

ALTER TABLE public.global_settings
    ADD COLUMN IF NOT EXISTS cost_settings JSONB NOT NULL DEFAULT '[
        {"id": "gpt-image-2.6-flare", "modelName": "gpt-image-2.6-flare", "promptOnly": 0.04, "ref1": 0.06, "ref2": 0.08, "ref3": 0.10},
        {"id": "gpt-image-2.5-flare", "modelName": "gpt-image-2.5-flare", "promptOnly": 0.035, "ref1": 0.05, "ref2": 0.065, "ref3": 0.08},
        {"id": "gpt-image-2", "modelName": "gpt-image-2", "promptOnly": 0.03, "ref1": 0.045, "ref2": 0.06, "ref3": 0.075},
        {"id": "gemini-nano-banana-2.1", "modelName": "gemini-nano-banana-2.1", "promptOnly": 0.02, "ref1": 0.03, "ref2": 0.04, "ref3": 0.05}
    ]'::jsonb;

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS reference_images_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_test_project BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';

