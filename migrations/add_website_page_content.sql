-- Website page content: editable hero and terms for Emergency Response, Plumbing, and Terms of Service pages.
-- Run in Supabase SQL Editor. Requires storage schema (Supabase provides it).

-- ============================================================
-- 1. Table: website_page_content
-- ============================================================
CREATE TABLE IF NOT EXISTS website_page_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_key VARCHAR(64) UNIQUE NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE website_page_content IS 'Editable content for public website pages (emergency, plumbing, terms). Dashboard: Emergency Dispatch → Settings → Website pages.';
COMMENT ON COLUMN website_page_content.page_key IS 'One of: emergency-main, plumbing-main, terms-of-service';
COMMENT ON COLUMN website_page_content.content IS 'JSON: hero pages use { hero_image_url, hero_header, hero_subtext, buttons: [{ label, url }] }; terms uses { page_title, page_subtext, sections: [{ id, header, content }] }';

CREATE INDEX IF NOT EXISTS idx_website_page_content_page_key ON website_page_content(page_key);

-- ============================================================
-- 2. RLS: allow public read (for public pages), admin write via backend
-- ============================================================
ALTER TABLE website_page_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read website_page_content" ON website_page_content;
CREATE POLICY "Public read website_page_content"
  ON website_page_content FOR SELECT TO public
  USING (true);

-- Write: only service role / backend (no anon or authenticated policy = backend-only writes)
-- If you need dashboard users to update via Supabase client, add:
-- CREATE POLICY "Authenticated update website_page_content" ON website_page_content FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3. Seed rows (default content; dashboard can override)
-- ============================================================
INSERT INTO website_page_content (page_key, content, updated_at) VALUES
  (
    'emergency-main',
    '{
      "hero_image_url": "",
      "hero_header": "Need Help Right Now?",
      "hero_subtext": "Call our 24/7 local emergency network.",
      "buttons": [
        { "label": "CALL NOW — AVAILABLE 24/7", "url": "tel" },
        { "label": "Text Us", "url": "sms" },
        { "label": "Request Help Online", "url": "#form" }
      ]
    }'::jsonb,
    NOW()
  ),
  (
    'plumbing-main',
    '{
      "hero_image_url": "",
      "hero_header": "24/7 Emergency Plumbing",
      "hero_subtext": "Leaks, clogs, no hot water, burst pipes—we connect you with licensed local plumbers. Call or submit the form below.",
      "buttons": [
        { "label": "Call now — 24/7", "url": "tel" },
        { "label": "Text us", "url": "sms" },
        { "label": "Request help online", "url": "#form" }
      ]
    }'::jsonb,
    NOW()
  ),
  (
    'terms-of-service',
    '{
      "page_title": "Terms of Service",
      "page_subtext": "Emergency Dispatch Service — Last updated: March 2025",
      "sections": [
        { "id": "1", "header": "1. We Are a Dispatch Service", "content": "Tavari Emergency Dispatch (\"we,\" \"us,\" or \"the service\") is a dispatch and referral service. We connect customers who need emergency or scheduled service with independent, third-party licensed professionals (e.g., plumbers, HVAC technicians). We do not perform any repair, installation, or trade work ourselves. We are not the service provider." },
        { "id": "2", "header": "2. No Provider Relationship", "content": "Any work performed at your property is done by the independent professional we connect you with. The contract for service is between you and that provider. We are not a party to that agreement and are not responsible for the quality, timing, pricing, or outcome of the work performed." },
        { "id": "3", "header": "3. Your Responsibility: Verify License, Insurance & Terms", "content": "You are responsible for verifying the provider's license, insurance, and terms when they contact you or before work begins. We recommend that you confirm the provider's credentials, scope of work, and pricing directly with them. We do not guarantee the credentials or conduct of any third-party provider." },
        { "id": "4", "header": "4. Use of the Service", "content": "By calling our number, submitting a form, or otherwise using the Emergency Dispatch service, you agree to these Terms. You agree to provide accurate contact and location information so we can connect you with a provider. You are responsible for being available to receive calls or messages from us or from a provider we refer." },
        { "id": "5", "header": "5. Limitation of Liability", "content": "To the fullest extent permitted by law, we are not liable for any direct, indirect, incidental, or consequential damages arising from your use of the dispatch service or from the acts or omissions of any provider we refer you to. Our liability is limited to the extent permitted by applicable law." },
        { "id": "6", "header": "6. Contact", "content": "For questions about these Terms or the Emergency Dispatch service, contact us through the contact information provided on the Tavari website or in the communications we send you." }
      ]
    }'::jsonb,
    NOW()
  )
ON CONFLICT (page_key) DO NOTHING;

-- ============================================================
-- 4. Storage bucket: website-hero (hero images)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'website-hero',
  'website-hero',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/gif','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- 5. Storage RLS: public read (images load on public pages)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'website-hero: public read'
  ) THEN
    CREATE POLICY "website-hero: public read"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'website-hero');
  END IF;
END $$;

-- Uploads: backend uses service_role (bypasses RLS). Optional: allow authenticated uploads from dashboard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'website-hero: authenticated insert'
  ) THEN
    CREATE POLICY "website-hero: authenticated insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'website-hero');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'website-hero: authenticated update'
  ) THEN
    CREATE POLICY "website-hero: authenticated update"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'website-hero');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'website-hero: authenticated delete'
  ) THEN
    CREATE POLICY "website-hero: authenticated delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'website-hero');
  END IF;
END $$;
