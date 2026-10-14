-- Add feedback tracking table
CREATE TABLE IF NOT EXISTS review_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  review_output_id UUID NOT NULL REFERENCES reviews_outputs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  feedback_type VARCHAR(20) NOT NULL, -- 'like', 'dislike', 'regenerate'
  adjustment_type VARCHAR(50), -- 'more_friendly', 'more_professional', 'more_firm', 'shorter', 'more_detailed'
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_feedback_business_id ON review_feedback(business_id);
CREATE INDEX IF NOT EXISTS idx_review_feedback_output_id ON review_feedback(review_output_id);
CREATE INDEX IF NOT EXISTS idx_review_feedback_user_id ON review_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_review_feedback_created_at ON review_feedback(created_at DESC);

-- Add analysis fields to reviews_outputs
ALTER TABLE reviews_outputs
ADD COLUMN IF NOT EXISTS sentiment VARCHAR(20),
ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20),
ADD COLUMN IF NOT EXISTS crisis_detected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS response_posture VARCHAR(50),
ADD COLUMN IF NOT EXISTS tone_slider_value INTEGER,
ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS regenerate_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS review_date DATE,
ADD COLUMN IF NOT EXISTS location_id UUID;

CREATE INDEX IF NOT EXISTS idx_reviews_outputs_sentiment ON reviews_outputs(sentiment);
CREATE INDEX IF NOT EXISTS idx_reviews_outputs_risk_level ON reviews_outputs(risk_level);
CREATE INDEX IF NOT EXISTS idx_reviews_outputs_crisis_detected ON reviews_outputs(crisis_detected);





