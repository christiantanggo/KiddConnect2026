-- Log riddles deleted or rejected from the UI so the generator does not reuse them.
-- Used by: DELETE /stories/:id and POST /stories/:id/reject (when story is riddle).
-- Read by: riddle-generator loadRiddleHistory() to merge into usedAnswers and recentRiddles.

CREATE TABLE IF NOT EXISTS orbix_deleted_riddles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES orbix_channels(id) ON DELETE CASCADE,
  riddle_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  source VARCHAR(20) NOT NULL CHECK (source IN ('deleted', 'rejected')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orbix_deleted_riddles_business_channel ON orbix_deleted_riddles(business_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_orbix_deleted_riddles_created_at ON orbix_deleted_riddles(created_at DESC);

COMMENT ON TABLE orbix_deleted_riddles IS 'Riddles removed from UI (delete/reject); generator avoids reusing these.';
