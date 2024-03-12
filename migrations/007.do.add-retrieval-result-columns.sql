ALTER TABLE retrieval_results
  ADD COLUMN status_code INTEGER,
  ADD COLUMN end_at TIMESTAMPTZ;
