-- Add selected_reply_option column to review_feedback table
-- This tracks which specific reply option (Short/Medium/Long) was liked

ALTER TABLE review_feedback
ADD COLUMN IF NOT EXISTS selected_reply_option VARCHAR(20); -- 'Short', 'Medium', 'Long'

CREATE INDEX IF NOT EXISTS idx_review_feedback_selected_reply ON review_feedback(selected_reply_option);

