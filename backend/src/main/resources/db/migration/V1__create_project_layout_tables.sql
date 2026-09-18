CREATE TABLE projects (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    room_type VARCHAR(100) NOT NULL,
    width DOUBLE PRECISION NOT NULL,
    depth DOUBLE PRECISION NOT NULL,
    height DOUBLE PRECISION NOT NULL,
    floor_plan_file_name VARCHAR(500) NOT NULL DEFAULT '',
    floor_plan_size BIGINT NOT NULL DEFAULT 0,
    floor_plan_status VARCHAR(20) NOT NULL DEFAULT 'EMPTY',
    floor_plan_progress INTEGER NOT NULL DEFAULT 0,
    floor_plan_uploaded_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE furniture_items (
    project_id VARCHAR(100) NOT NULL,
    id VARCHAR(100) NOT NULL,
    catalog_id VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL,
    x DOUBLE PRECISION NOT NULL,
    z DOUBLE PRECISION NOT NULL,
    rotation INTEGER NOT NULL,
    color VARCHAR(20) NOT NULL,
    item_order INTEGER NOT NULL,
    PRIMARY KEY (project_id, id),
    CONSTRAINT furniture_project_fk FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX furniture_project_order_idx ON furniture_items (project_id, item_order);
