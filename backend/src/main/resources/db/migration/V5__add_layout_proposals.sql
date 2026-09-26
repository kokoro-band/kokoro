CREATE TABLE layout_proposals (
    proposal_id VARCHAR(100) PRIMARY KEY,
    project_id VARCHAR(100) NOT NULL,
    owner_id VARCHAR(100) NOT NULL,
    base_updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    commands TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT layout_proposal_project_fk FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX layout_proposals_project_idx ON layout_proposals (project_id);
