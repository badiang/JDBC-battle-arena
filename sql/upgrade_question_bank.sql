-- RUN ONCE in phpMyAdmin after selecting jdbc_arena. Back up first.
USE jdbc_arena;
ALTER TABLE questions ADD COLUMN difficulty ENUM('Easy','Medium','Hard') NOT NULL DEFAULT 'Medium';
