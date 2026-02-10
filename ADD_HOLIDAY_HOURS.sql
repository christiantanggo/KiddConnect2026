-- Add holiday_hours column to ai_agents table
-- Holiday hours will be stored as JSONB array of objects:
-- [
--   {
--     "name": "Christmas Day",
--     "date": "2025-12-25",
--     "closed": true,
--     "open": null,
--     "close": null
--   },
--   {
--     "name": "Christmas Eve",
--     "date": "2025-12-24",
--     "closed": false,
--     "open": "10:00",
--     "close": "14:00"
--   }
-- ]

ALTER TABLE ai_agents 
ADD COLUMN IF NOT EXISTS holiday_hours JSONB DEFAULT '[]'::jsonb;

-- Create index for holiday hours queries (if needed in future)
CREATE INDEX IF NOT EXISTS idx_ai_agents_holiday_hours ON ai_agents USING GIN (holiday_hours);

-- Verification query
SELECT 
  'ai_agents.holiday_hours' AS column_check,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_agents' AND column_name = 'holiday_hours'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END AS status;



















