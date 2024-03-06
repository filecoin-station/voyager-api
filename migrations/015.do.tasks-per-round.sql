CREATE TABLE retrieval_tasks (
  id SERIAL NOT NULL PRIMARY KEY,
  round_id BIGINT NOT NULL REFERENCES voyager_rounds(id),
  cid TEXT NOT NULL
  -- Note: we cannot enforce the following uniqueness constraint because retrieval_templates
  -- contain duplicate data.
  -- UNIQUE(round_id, cid)
);
