-- Fix stuck renders that are in PROCESSING status
-- This resets them back to PENDING so they can be picked up by the render job again

-- First, let's see what renders are stuck
SELECT 
  id,
  render_status,
  created_at,
  updated_at,
  story_id
FROM orbix_renders
WHERE render_status = 'PROCESSING'
ORDER BY updated_at;

-- Reset stuck PROCESSING renders back to PENDING
-- This allows the render job to pick them up again
UPDATE orbix_renders
SET 
  render_status = 'PENDING',
  updated_at = NOW(),
  error_message = NULL,
  step_error = NULL
WHERE render_status = 'PROCESSING';

-- Verify the update
SELECT 
  id,
  render_status,
  created_at,
  updated_at,
  story_id
FROM orbix_renders
WHERE id IN (
  SELECT id FROM orbix_renders WHERE render_status = 'PENDING'
)
ORDER BY updated_at;

