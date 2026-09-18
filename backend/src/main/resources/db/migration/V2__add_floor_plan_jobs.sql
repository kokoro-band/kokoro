ALTER TABLE projects
    ADD COLUMN floor_plan_job_id VARCHAR(100),
    ADD COLUMN floor_plan_object_key VARCHAR(500),
    ADD COLUMN floor_plan_error_code VARCHAR(100),
    ADD COLUMN floor_plan_error_message VARCHAR(1000),
    ADD COLUMN floor_plan_retryable BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE floor_plan_jobs (
    job_id VARCHAR(100) PRIMARY KEY,
    project_id VARCHAR(100) NOT NULL,
    object_key VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    error_code VARCHAR(100),
    error_message VARCHAR(1000),
    retryable BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT floor_plan_job_project_fk FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX floor_plan_jobs_project_idx ON floor_plan_jobs (project_id, created_at DESC);
