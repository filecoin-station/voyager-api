CREATE INDEX CONCURRENTLY measurements_finished_at ON measurements (finished_at) WHERE finished_at IS NOT NULL;
