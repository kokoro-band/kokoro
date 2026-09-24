ALTER TABLE projects ADD COLUMN room JSONB;

UPDATE furniture_items f
   SET x = ROUND((f.x / 100.0 * p.width)::numeric, 2),
       z = ROUND((f.z / 100.0 * p.depth)::numeric, 2)
  FROM projects p
 WHERE f.project_id = p.id;

COMMENT ON COLUMN furniture_items.x IS '가구 바닥 중심의 x 좌표(m). 원점은 공간 데이터 바운딩 박스의 왼쪽 위입니다.';
COMMENT ON COLUMN furniture_items.z IS '가구 바닥 중심의 z 좌표(m).';
COMMENT ON COLUMN projects.room IS 'RoomModel JSON. docs/contracts/room-model.md를 따릅니다.';
