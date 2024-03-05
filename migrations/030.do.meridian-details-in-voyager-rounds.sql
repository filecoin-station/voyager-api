ALTER TABLE voyager_rounds
ADD COLUMN meridian_address TEXT;

ALTER TABLE voyager_rounds
ADD COLUMN meridian_round BIGINT;

CREATE INDEX voyager_rounds_meridian ON voyager_rounds(meridian_address, meridian_round);

ALTER TABLE retrieval_tasks
DROP CONSTRAINT retrieval_tasks_round_id_fkey;

ALTER TABLE retrieval_tasks
ADD CONSTRAINT retrieval_tasks_round_id_fkey
FOREIGN KEY (round_id) REFERENCES voyager_rounds(id) ON DELETE CASCADE;

