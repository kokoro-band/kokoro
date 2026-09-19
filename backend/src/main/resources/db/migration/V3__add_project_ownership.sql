ALTER TABLE projects ADD COLUMN owner_id VARCHAR(100);
UPDATE projects SET owner_id = 'local-user' WHERE owner_id IS NULL;
ALTER TABLE projects ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX projects_owner_idx ON projects (owner_id, updated_at DESC);
