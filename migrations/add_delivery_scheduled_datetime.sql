-- Scheduled date and time for delivery (Schedule priority). Sent to Shipday in business timezone.
-- scheduled_date: day of delivery (YYYY-MM-DD). scheduled_time: preferred delivery time (HH:mm or HH:mm:ss).
ALTER TABLE delivery_requests
  ADD COLUMN IF NOT EXISTS scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS scheduled_time VARCHAR(10);

COMMENT ON COLUMN delivery_requests.scheduled_date IS 'For Schedule priority: delivery day in business timezone (YYYY-MM-DD)';
COMMENT ON COLUMN delivery_requests.scheduled_time IS 'For Schedule priority: preferred delivery time (HH:mm or HH:mm:ss) in business timezone';
