-- Add module_key column to support_tickets table
-- This allows users to specify which module their support ticket is for

ALTER TABLE support_tickets
ADD COLUMN IF NOT EXISTS module_key VARCHAR(50);

-- Add index for filtering tickets by module
CREATE INDEX IF NOT EXISTS idx_support_tickets_module_key ON support_tickets(module_key);

-- Add comment
COMMENT ON COLUMN support_tickets.module_key IS 'Module key (e.g., phone-agent, reviews, clickbank) that this support ticket relates to';

