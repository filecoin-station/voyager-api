-- Delete previous CIDs. We don't know if they are still expected to be retrievable,
-- as their storage deals may have expired.
UPDATE retrieval_templates SET deleted = true;
