CREATE DATABASE IF NOT EXISTS jdbc_arena CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE jdbc_arena;
CREATE TABLE IF NOT EXISTS users (
 id INT AUTO_INCREMENT PRIMARY KEY, student_id VARCHAR(40) NOT NULL UNIQUE,
 full_name VARCHAR(120) NOT NULL, section VARCHAR(80) NOT NULL DEFAULT '',
 password_hash VARCHAR(255) NOT NULL, role ENUM('admin','student') NOT NULL DEFAULT 'student',
 active TINYINT(1) NOT NULL DEFAULT 1, must_change_password TINYINT(1) NOT NULL DEFAULT 1,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS questions (
 id INT AUTO_INCREMENT PRIMARY KEY, topic VARCHAR(80) NOT NULL,
 question TEXT NOT NULL, option_a VARCHAR(500) NOT NULL, option_b VARCHAR(500) NOT NULL,
 option_c VARCHAR(500) NOT NULL, option_d VARCHAR(500) NOT NULL,
 correct_answer ENUM('A','B','C','D') NOT NULL, difficulty ENUM('Easy','Medium','Hard') NOT NULL DEFAULT 'Medium', active TINYINT(1) NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS matches (
 id INT AUTO_INCREMENT PRIMARY KEY, status ENUM('waiting','playing','finished','cancelled') NOT NULL DEFAULT 'waiting',
 created_by INT NOT NULL, question_count INT NOT NULL DEFAULT 10, seconds_per_question INT NOT NULL DEFAULT 20,
 current_index INT NOT NULL DEFAULT -1, question_started_at DATETIME(3) NULL,
 winner_id INT NULL, topic_filter VARCHAR(80) NOT NULL DEFAULT '', difficulty_filter VARCHAR(10) NOT NULL DEFAULT '', scheduled_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 started_at DATETIME NULL, finished_at DATETIME NULL,
 FOREIGN KEY (created_by) REFERENCES users(id), FOREIGN KEY (winner_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS match_players (
 match_id INT NOT NULL, user_id INT NOT NULL, score INT NOT NULL DEFAULT 0,
 PRIMARY KEY(match_id,user_id), FOREIGN KEY(match_id) REFERENCES matches(id), FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS match_questions (
 match_id INT NOT NULL, position INT NOT NULL, question_id INT NOT NULL,
 PRIMARY KEY(match_id,position), FOREIGN KEY(match_id) REFERENCES matches(id), FOREIGN KEY(question_id) REFERENCES questions(id)
);
CREATE TABLE IF NOT EXISTS match_answers (
 match_id INT NOT NULL, position INT NOT NULL, user_id INT NOT NULL,
 answer ENUM('A','B','C','D') NOT NULL, correct TINYINT(1) NOT NULL,
 response_ms INT NOT NULL, points INT NOT NULL,
 PRIMARY KEY(match_id,position,user_id), FOREIGN KEY(match_id) REFERENCES matches(id), FOREIGN KEY(user_id) REFERENCES users(id)
);
