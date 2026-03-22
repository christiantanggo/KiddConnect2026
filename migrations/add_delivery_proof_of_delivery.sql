-- Proof of delivery from Shipday (signature + photos) for dispatching company visibility.
-- Run in Supabase SQL Editor.

ALTER TABLE delivery_requests
  ADD COLUMN IF NOT EXISTS pod_signature_url TEXT,
  ADD COLUMN IF NOT EXISTS pod_photo_urls JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pod_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pod_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pod_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pod_source VARCHAR(30) DEFAULT 'shipday';

COMMENT ON COLUMN delivery_requests.pod_signature_url IS 'Customer signature image URL from Shipday proofOfDelivery.signaturePath';
COMMENT ON COLUMN delivery_requests.pod_photo_urls IS 'JSON array of proof photo URLs from Shipday proofOfDelivery.imageUrls';
