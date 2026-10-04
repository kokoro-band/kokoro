-- Supersedes the unmerged PR80/V6 implementation. Do not add that V6 to this history.
ALTER TABLE projects ADD COLUMN revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0);

-- NULL deliberately invalidates pending proposals from servers without revision support.
-- Do not backfill from the current project: it may differ from the proposed snapshot.
ALTER TABLE layout_proposals ADD COLUMN base_revision BIGINT CHECK (base_revision >= 0);
