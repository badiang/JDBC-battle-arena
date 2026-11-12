-- Run ONCE against existing jdbc_arena database. Do not recreate tables.
USE jdbc_arena;
ALTER TABLE matches
  ADD COLUMN topic_filter VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN difficulty_filter VARCHAR(10) NOT NULL DEFAULT '',
  ADD COLUMN scheduled_at DATETIME NULL;
