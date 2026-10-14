-- Retire Micro Story / Micro Dad Joke shorts format from the catalog (no longer offered in UI).
UPDATE dadjoke_studio_formats
SET deleted_at = NOW(), updated_at = NOW()
WHERE format_key = 'shorts_micro_story';
