CREATE INDEX CONCURRENTLY measurements_locked
  ON measurements (locked_by_pid)
  WHERE locked_by_pid IS NOT NULL;
