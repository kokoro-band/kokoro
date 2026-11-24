-- 사진으로 잰 가구처럼 카탈로그가 아닌 가구(catalog_id = 'custom-box')는 자기 크기(m)를 가진다.
-- V12는 #222(회원가입)가 사용한다.
ALTER TABLE furniture_items
    ADD COLUMN size_width DOUBLE PRECISION,
    ADD COLUMN size_depth DOUBLE PRECISION,
    ADD COLUMN size_height DOUBLE PRECISION,
    ADD CONSTRAINT furniture_size_all_or_none CHECK (
        (size_width IS NULL AND size_depth IS NULL AND size_height IS NULL)
        OR (size_width IS NOT NULL AND size_depth IS NOT NULL AND size_height IS NOT NULL)
    );
