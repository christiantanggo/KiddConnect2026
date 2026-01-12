-- Add Tavari Phone Agent V2 module
INSERT INTO modules (key, name, description, category, is_active, health_status) VALUES
  ('phone-agent-v2', 'Tavari Phone Agent V2', 'Enhanced AI phone answering system with modern interface', 'communication', TRUE, 'healthy')
ON CONFLICT (key) DO UPDATE SET 
  name = EXCLUDED.name, 
  description = EXCLUDED.description, 
  category = EXCLUDED.category, 
  is_active = EXCLUDED.is_active, 
  health_status = EXCLUDED.health_status;


