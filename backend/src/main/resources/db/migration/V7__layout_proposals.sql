CREATE TABLE layout_proposals (
    id VARCHAR(100) PRIMARY KEY,
    project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    owner_id VARCHAR(255) NOT NULL,
    base_revision BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPLIED', 'CANCELLED')),
    proposed_furniture JSONB NOT NULL,
    actions JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX layout_proposals_project_idx ON layout_proposals(project_id, created_at);
