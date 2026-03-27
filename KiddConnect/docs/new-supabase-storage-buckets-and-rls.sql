-- =============================================================================
-- Safe to run anytime: storage buckets always apply; RLS runs only for tables
-- that already exist (skips missing tables — re-run after migrations).
--
-- Schema: apply repo migrations/ or pg_dump --schema-only first if you need
-- hr_contracts, users, website_page_content.
--
-- Contents: (1) storage.buckets parity from old project audit
--           (2) ENABLE ROW LEVEL SECURITY + policies from old project audit
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Storage buckets (id must match paths your API stores in DB)
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'dadjoke-studio-assets',
    'dadjoke-studio-assets',
    true,
    52428800,
    ARRAY[
      'image/jpeg', 'image/png', 'image/webp',
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac'
    ]::text[]
  ),
  (
    'dadjoke-studio-renders',
    'dadjoke-studio-renders',
    true,
    524288000,
    ARRAY['video/mp4']::text[]
  ),
  (
    'kidquiz-photos',
    'kidquiz-photos',
    true,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'kidquiz-videos',
    'kidquiz-videos',
    true,
    524288000,
    ARRAY['video/mp4']::text[]
  ),
  (
    'movie-review-images',
    'movie-review-images',
    true,
    10485760,
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']::text[]
  ),
  (
    'movie-review-music',
    'movie-review-music',
    true,
    52428800,
    ARRAY['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/webm']::text[]
  ),
  (
    'movie-review-renders',
    'movie-review-renders',
    true,
    524288000,
    ARRAY['video/mp4']::text[]
  ),
  (
    'movie-review-voices',
    'movie-review-voices',
    true,
    52428800,
    ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a']::text[]
  ),
  (
    'orbix-network-backgrounds',
    'orbix-network-backgrounds',
    true,
    NULL,
    NULL
  ),
  (
    'orbix-network-music',
    'orbix-network-music',
    true,
    NULL,
    NULL
  ),
  (
    'orbix-network-videos',
    'orbix-network-videos',
    true,
    NULL,
    NULL
  ),
  (
    'website-hero',
    'website-hero',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- If you use storage RLS on objects, recreate those policies in Dashboard or add
-- a separate migration; this file only creates buckets.

-- -----------------------------------------------------------------------------
-- 2) Row Level Security (public.users.id must match auth.users.id / auth.uid())
--    Skips tables that do not exist yet — re-run this whole file after schema
--    migrations so hr_contracts / users / website_page_content pick up policies.
-- -----------------------------------------------------------------------------

DO $rls_hr$
BEGIN
  IF to_regclass('public.hr_contracts') IS NULL THEN
    RAISE NOTICE 'Skipping hr_contracts RLS: table public.hr_contracts does not exist yet.';
    RETURN;
  END IF;

  ALTER TABLE public.hr_contracts ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Business owners can create contracts" ON public.hr_contracts;
  DROP POLICY IF EXISTS "Business owners can update contracts" ON public.hr_contracts;
  DROP POLICY IF EXISTS "Business owners can view their contracts" ON public.hr_contracts;
  DROP POLICY IF EXISTS hr_contracts_personal_info_token_select ON public.hr_contracts;
  DROP POLICY IF EXISTS hr_contracts_personal_info_token_update ON public.hr_contracts;

  CREATE POLICY "Business owners can create contracts"
    ON public.hr_contracts FOR INSERT TO public
    WITH CHECK (
      (business_id IN (
        SELECT businesses.id
        FROM businesses
        WHERE (hr_contracts.created_by = auth.uid())
      ))
      OR (created_by = auth.uid())
    );

  CREATE POLICY "Business owners can update contracts"
    ON public.hr_contracts FOR UPDATE TO public
    USING (
      (business_id IN (
        SELECT businesses.id
        FROM businesses
        WHERE (hr_contracts.created_by = auth.uid())
      ))
      OR (created_by = auth.uid())
    );

  CREATE POLICY "Business owners can view their contracts"
    ON public.hr_contracts FOR SELECT TO public
    USING (
      (business_id IN (
        SELECT businesses.id
        FROM businesses
        WHERE (hr_contracts.created_by = auth.uid())
      ))
      OR (created_by = auth.uid())
    );

  CREATE POLICY hr_contracts_personal_info_token_select
    ON public.hr_contracts FOR SELECT TO public
    USING (personal_info_token IS NOT NULL);

  CREATE POLICY hr_contracts_personal_info_token_update
    ON public.hr_contracts FOR UPDATE TO public
    USING (personal_info_token IS NOT NULL)
    WITH CHECK (personal_info_token IS NOT NULL);
END
$rls_hr$;

DO $rls_users$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE NOTICE 'Skipping users RLS: table public.users does not exist yet.';
    RETURN;
  END IF;

  ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Users can update their own record" ON public.users;
  DROP POLICY IF EXISTS "Users can view their own record" ON public.users;
  DROP POLICY IF EXISTS users_personal_info_token_insert ON public.users;
  DROP POLICY IF EXISTS users_personal_info_token_select ON public.users;
  DROP POLICY IF EXISTS users_personal_info_token_update ON public.users;

  CREATE POLICY "Users can update their own record"
    ON public.users FOR UPDATE TO public
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

  CREATE POLICY "Users can view their own record"
    ON public.users FOR SELECT TO public
    USING (auth.uid() = id);

  -- References hr_contracts: only create when both tables exist
  IF to_regclass('public.hr_contracts') IS NOT NULL THEN
    CREATE POLICY users_personal_info_token_insert
      ON public.users FOR INSERT TO public
      WITH CHECK (
        (EXISTS (
          SELECT 1
          FROM hr_contracts
          WHERE (hr_contracts.employee_email = (users.email)::text)
            AND (hr_contracts.personal_info_token IS NOT NULL)
        ))
        OR (personal_info_token IS NOT NULL)
      );
  ELSE
    RAISE NOTICE 'Skipping users_personal_info_token_insert: public.hr_contracts does not exist yet (re-run this script after hr_contracts migration).';
  END IF;

  CREATE POLICY users_personal_info_token_select
    ON public.users FOR SELECT TO public
    USING (personal_info_token IS NOT NULL);

  CREATE POLICY users_personal_info_token_update
    ON public.users FOR UPDATE TO public
    USING (personal_info_token IS NOT NULL)
    WITH CHECK (personal_info_token IS NOT NULL);
END
$rls_users$;

DO $rls_site$
BEGIN
  IF to_regclass('public.website_page_content') IS NULL THEN
    RAISE NOTICE 'Skipping website_page_content RLS: table does not exist yet.';
    RETURN;
  END IF;

  ALTER TABLE public.website_page_content ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Public read website_page_content" ON public.website_page_content;

  CREATE POLICY "Public read website_page_content"
    ON public.website_page_content FOR SELECT TO public
    USING (true);
END
$rls_site$;
