-- Update module names to include "Tavari AI" prefix
-- Change "Review Reply AI" to "Tavari AI Review Reply"
-- Change "Phone Agent" to "Tavari AI Phone Agent"

UPDATE modules 
SET name = 'Tavari AI Review Reply',
    updated_at = NOW()
WHERE key = 'reviews' AND name = 'Review Reply AI';

UPDATE modules 
SET name = 'Tavari AI Phone Agent',
    updated_at = NOW()
WHERE key = 'phone-agent' AND name = 'Phone Agent';

