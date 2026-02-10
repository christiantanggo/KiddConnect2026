-- Storage Policies for Orbix Network Videos Bucket
-- Run this in Supabase SQL Editor: Dashboard → SQL Editor → New Query

-- Allow public read access to videos (so video URLs work)
CREATE POLICY "Allow public read access to orbix-network-videos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'orbix-network-videos');

-- Allow authenticated users (backend with service role) to upload videos
CREATE POLICY "Allow authenticated upload to orbix-network-videos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'orbix-network-videos');

-- Allow authenticated users to update/delete videos
CREATE POLICY "Allow authenticated update to orbix-network-videos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'orbix-network-videos');

CREATE POLICY "Allow authenticated delete to orbix-network-videos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'orbix-network-videos');




