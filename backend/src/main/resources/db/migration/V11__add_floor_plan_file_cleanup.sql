-- Pending floor-plan file deletions. No foreign key: rows outlive the deleted project.
CREATE TABLE floor_plan_file_cleanup (
    object_key VARCHAR(500) PRIMARY KEY,
    project_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    last_error VARCHAR(1000)
);

CREATE INDEX floor_plan_file_cleanup_created_idx ON floor_plan_file_cleanup (created_at);
