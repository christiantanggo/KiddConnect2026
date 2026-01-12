-- Add greeting, personality, and voice fields to ai_agents table
ALTER TABLE ai_agents 
ADD COLUMN IF NOT EXISTS opening_greeting TEXT,
ADD COLUMN IF NOT EXISTS ending_greeting TEXT,
ADD COLUMN IF NOT EXISTS personality VARCHAR(50) DEFAULT 'professional',
ADD COLUMN IF NOT EXISTS voice_provider VARCHAR(50) DEFAULT '11labs',
ADD COLUMN IF NOT EXISTS voice_id VARCHAR(100) DEFAULT '21m00Tcm4TlvDq8ikWAM';
















