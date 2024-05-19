ALTER TABLE measurements RENAME COLUMN locked_by_pid TO lock;
ALTER TABLE measurements ALTER COLUMN lock TYPE TEXT;
