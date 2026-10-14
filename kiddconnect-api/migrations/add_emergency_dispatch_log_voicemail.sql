-- Emergency dispatch: allow 'voicemail' as a result when VAPI voicemail detection ends the call.
ALTER TABLE emergency_dispatch_log
  DROP CONSTRAINT IF EXISTS emergency_dispatch_log_result_check;

ALTER TABLE emergency_dispatch_log
  ADD CONSTRAINT emergency_dispatch_log_result_check
  CHECK (result IS NULL OR result IN ('accepted', 'declined', 'no_answer', 'voicemail', 'error', 'pending'));
