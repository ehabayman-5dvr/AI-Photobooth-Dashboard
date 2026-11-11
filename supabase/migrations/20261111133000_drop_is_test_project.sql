-- ==============================================================================
-- Migration: Remove deprecated is_test_project column from projects
-- ==============================================================================

ALTER TABLE public.projects
    DROP COLUMN IF EXISTS is_test_project;

NOTIFY pgrst, 'reload schema';

