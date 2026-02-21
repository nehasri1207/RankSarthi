-- Exams Table
CREATE TABLE IF NOT EXISTS exams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,          
    category VARCHAR(100) NOT NULL,             
    total_questions INT NOT NULL,
    marks_per_question DOUBLE NOT NULL,
    negative_marks DOUBLE NOT NULL,
    total_marks DOUBLE AS (total_questions * marks_per_question) VIRTUAL,
    is_normalization_visible BOOLEAN DEFAULT 0
);

-- Mock Rank Data Table
CREATE TABLE IF NOT EXISTS rank_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_id INT NOT NULL,
    min_score DOUBLE NOT NULL,
    max_score DOUBLE NOT NULL,
    min_rank INT NOT NULL,
    max_rank INT NOT NULL,
    cutoff_probability ENUM('High', 'Medium', 'Low'),
    FOREIGN KEY(exam_id) REFERENCES exams(id)
);

-- User Results Table (for rank/percentile calculation)
CREATE TABLE IF NOT EXISTS user_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_id INT NOT NULL,
    roll_no VARCHAR(100),
    name VARCHAR(255),
    category VARCHAR(100),
    gender VARCHAR(50),
    medium VARCHAR(50),
    horizontal_category VARCHAR(100),
    exam_date VARCHAR(50),
    exam_shift VARCHAR(50),
    state VARCHAR(100),
    zone VARCHAR(100),
    total_score DOUBLE,
    sections_data TEXT,
    extra_info TEXT,
    correct_count INT,
    wrong_count INT,
    wrong_questions_data LONGTEXT,
    normalized_score DOUBLE,
    zone_normalized_score DOUBLE,
    percentile DOUBLE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(exam_id) REFERENCES exams(id),
    UNIQUE(exam_id, roll_no),
    INDEX idx_results_exam (exam_id),
    INDEX idx_results_score (total_score),
    INDEX idx_results_category (category),
    INDEX idx_results_shift (exam_date, exam_shift),
    INDEX idx_results_roll (roll_no)
);

-- Application Forms / Updates Table
CREATE TABLE IF NOT EXISTS form_updates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    category ENUM('Result', 'Admit Card', 'Latest Jobs', 'Answer Key', 'Admission', 'Syllabus') NOT NULL,
    department VARCHAR(255),
    last_date DATE,
    is_trending BOOLEAN DEFAULT 0,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed Data (Using INSERT IGNORE for MySQL)
INSERT IGNORE INTO exams (name, category, total_questions, marks_per_question, negative_marks) VALUES 
('SSC CGL (Tier 1)', 'SSC', 100, 2.0, 0.50),
('SSC CGL (Tier 2)', 'SSC', 130, 3.0, 1.0),
('SSC CHSL (Tier 1)', 'SSC', 100, 2.0, 0.50),
('SSC CHSL (Tier 2)', 'SSC', 130, 3.0, 1.0),
('SSC MTS', 'SSC', 100, 3.0, 1.0),
('SSC CPO (Paper 1)', 'SSC', 200, 1.0, 0.25),
('SSC JE (Paper 1)', 'SSC', 200, 1.0, 0.25),
('SSC Selection Post', 'SSC', 100, 2.0, 0.50),
('RRB NTPC Graduate', 'Railway', 100, 1.0, 0.33),
('RRB NTPC Under-Graduate', 'Railway', 100, 1.0, 0.33),
('RRB ALP (CBT 1)', 'Railway', 75, 1.0, 0.33),
('RRB Technician', 'Railway', 100, 1.0, 0.33),
('RRB JE (CBT 1)', 'Railway', 100, 1.0, 0.33),
('RRB Section Controller', 'Railway', 100, 1.0, 0.33),
('RRB Group D', 'Railway', 100, 1.0, 0.33),
('IBPS PO (Prelims)', 'Banking', 100, 1.0, 0.25),
('IBPS Clerk (Prelims)', 'Banking', 100, 1.0, 0.25),
('IBPS SO (Prelims)', 'Banking', 150, 1.0, 0.25),
('IBPS RRB PO (Prelims)', 'Banking', 80, 1.0, 0.25),
('IBPS RRB Clerk (Prelims)', 'Banking', 80, 1.0, 0.25),
('SBI PO (Prelims)', 'Banking', 100, 1.0, 0.25),
('SBI Clerk (Prelims)', 'Banking', 100, 1.0, 0.25),
('RBI Grade B (Phase 1)', 'Banking', 200, 1.0, 0.25),
('RBI Assistant (Prelims)', 'Banking', 100, 1.0, 0.25);

-- Initial Mock Rank Data
INSERT IGNORE INTO rank_data (exam_id, min_score, max_score, min_rank, max_rank, cutoff_probability) 
SELECT id, 80, 100, 1, 1000, 'High' FROM exams; 

INSERT IGNORE INTO rank_data (exam_id, min_score, max_score, min_rank, max_rank, cutoff_probability) 
SELECT id, 60, 79.9, 1001, 10000, 'Medium' FROM exams;

INSERT IGNORE INTO rank_data (exam_id, min_score, max_score, min_rank, max_rank, cutoff_probability) 
SELECT id, 0, 59.9, 10001, 500000, 'Low' FROM exams;
