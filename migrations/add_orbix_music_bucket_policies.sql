-- Storage policies for Orbix Network Music bucket
-- Create bucket 'orbix-network-music' in Supabase Dashboard first, then run this.
-- Dashboard: Storage → New bucket → orbix-network-music → Public (or configure RLS below)

DROP POLICY IF EXISTS "Allow public read orbix-network-music" ON storage.objects;
CREATE POLICY "Allow public read orbix-network-music"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'orbix-network-music');

DROP POLICY IF EXISTS "Allow authenticated upload orbix-network-music" ON storage.objects;
CREATE POLICY "Allow authenticated upload orbix-network-music"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'orbix-network-music');
