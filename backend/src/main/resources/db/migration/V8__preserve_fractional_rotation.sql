ALTER TABLE furniture_items ALTER COLUMN rotation TYPE DOUBLE PRECISION USING rotation::double precision;

COMMENT ON COLUMN furniture_items.rotation IS '가구의 회전각(도). 저장 시 정규화하거나 반올림하지 않습니다.';
