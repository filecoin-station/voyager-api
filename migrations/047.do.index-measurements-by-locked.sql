CREATE INDEX CONCURRENTLY measurements_locked
  ON measurements (locked_by_id)
  WHERE locked_by_id IS NOT NULL;
