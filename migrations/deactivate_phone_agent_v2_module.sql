-- Deactivate phone-agent-v2 module
-- This module is no longer needed as phone-agent is the standard module

UPDATE modules 
SET is_active = FALSE,
    updated_at = NOW()
WHERE key = 'phone-agent-v2';

