-- Check existing tables in the database
-- Run this first to see what tables already exist

-- List all tables in the public schema
SELECT 
    table_name,
    table_type
FROM 
    information_schema.tables
WHERE 
    table_schema = 'public'
ORDER BY 
    table_name;

-- Check if SMS tables already exist
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sms_campaigns') 
        THEN 'sms_campaigns EXISTS'
        ELSE 'sms_campaigns DOES NOT EXIST'
    END as sms_campaigns_status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sms_campaign_recipients') 
        THEN 'sms_campaign_recipients EXISTS'
        ELSE 'sms_campaign_recipients DOES NOT EXIST'
    END as sms_campaign_recipients_status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sms_opt_outs') 
        THEN 'sms_opt_outs EXISTS'
        ELSE 'sms_opt_outs DOES NOT EXIST'
    END as sms_opt_outs_status;

