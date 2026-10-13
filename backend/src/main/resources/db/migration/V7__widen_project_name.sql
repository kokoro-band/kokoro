-- Preserve existing names and support 80 multi-codepoint graphemes.
-- New writes have a 1024 UTF-16 unit limit in ProjectInputLimits.
ALTER TABLE projects ALTER COLUMN name TYPE TEXT;
