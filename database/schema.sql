-- Exams Table
CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,          
    category TEXT NOT NULL,             
    total_questions INTEGER NOT NULL,
    marks_per_question REAL NOT NULL,
    negative_marks REAL NOT NULL,
    total_marks REAL GENERATED ALWAYS AS (total_questions * marks_per_question) VIRTUAL
);

-- Mock Rank Data Table
CREATE TABLE IF NOT EXISTS rank_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    min_score REAL NOT NULL,
    max_score REAL NOT NULL,
    min_rank INTEGER NOT NULL,
    max_rank INTEGER NOT NULL,
    cutoff_probability TEXT CHECK(cutoff_probability IN ('High', 'Medium', 'Low')),
    FOREIGN KEY(exam_id) REFERENCES exams(id)
);

-- User Results Table (for rank/percentile calculation)
CREATE TABLE IF NOT EXISTS user_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    roll_no TEXT,
    name TEXT,
    category TEXT,
    gender TEXT,
    medium TEXT,
    horizontal_category TEXT,
    exam_date TEXT,
    exam_shift TEXT,
    state TEXT,
    zone TEXT,
    total_score REAL,
    sections_data TEXT,
    extra_info TEXT,
    correct_count INTEGER,
    wrong_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(exam_id) REFERENCES exams(id),
    UNIQUE(exam_id, roll_no)
);

-- Indexes for performance (Scaling to 2000+ per second)
CREATE INDEX IF NOT EXISTS idx_results_exam ON user_results(exam_id);
CREATE INDEX IF NOT EXISTS idx_results_score ON user_results(total_score);
CREATE INDEX IF NOT EXISTS idx_results_category ON user_results(category);
CREATE INDEX IF NOT EXISTS idx_results_shift ON user_results(exam_date, exam_shift);
CREATE INDEX IF NOT EXISTS idx_results_roll ON user_results(roll_no);


-- Seed Data
INSERT OR IGNORE INTO exams (name, category, total_questions, marks_per_question, negative_marks) VALUES 
-- SSC EXAMS
('SSC CGL (Tier 1)', 'SSC', 100, 2.0, 0.50),
('SSC CGL (Tier 2)', 'SSC', 130, 3.0, 1.0), -- Approx pattern
('SSC CHSL (Tier 1)', 'SSC', 100, 2.0, 0.50),
('SSC CHSL (Tier 2)', 'SSC', 130, 3.0, 1.0),
('SSC MTS', 'SSC', 100, 3.0, 1.0), -- Assumed Session 2 pattern approx
('SSC CPO (Paper 1)', 'SSC', 200, 1.0, 0.25),
('SSC JE (Paper 1)', 'SSC', 200, 1.0, 0.25),
('SSC Selection Post', 'SSC', 100, 2.0, 0.50),

-- RAILWAY EXAMS
('RRB NTPC Graduate', 'Railway', 100, 1.0, 0.33),
('RRB NTPC Under-Graduate', 'Railway', 100, 1.0, 0.33),
('RRB ALP (CBT 1)', 'Railway', 75, 1.0, 0.33),
('RRB Technician', 'Railway', 100, 1.0, 0.33),
('RRB JE (CBT 1)', 'Railway', 100, 1.0, 0.33),
('RRB Section Controller', 'Railway', 100, 1.0, 0.33),
('RRB Group D', 'Railway', 100, 1.0, 0.33),

-- BANKING EXAMS
('IBPS PO (Prelims)', 'Banking', 100, 1.0, 0.25),
('IBPS Clerk (Prelims)', 'Banking', 100, 1.0, 0.25),
('IBPS SO (Prelims)', 'Banking', 150, 1.0, 0.25),
('IBPS RRB PO (Prelims)', 'Banking', 80, 1.0, 0.25),
('IBPS RRB Clerk (Prelims)', 'Banking', 80, 1.0, 0.25),
('SBI PO (Prelims)', 'Banking', 100, 1.0, 0.25),
('SBI Clerk (Prelims)', 'Banking', 100, 1.0, 0.25),
('RBI Grade B (Phase 1)', 'Banking', 200, 1.0, 0.25),
('RBI Assistant (Prelims)', 'Banking', 100, 1.0, 0.25);

-- MOCK RANK DATA (Generic data for all exams to prevent errors)
-- We'll just insert some generic ranges for IDs 1 to 20
-- This is a little hacky but works for demo "Prediction" logic
INSERT OR IGNORE INTO rank_data (exam_id, min_score, max_score, min_rank, max_rank, cutoff_probability) 
SELECT id, 80, 100, 1, 1000, 'High' FROM exams; 

INSERT OR IGNORE INTO rank_data (exam_id, min_score, max_score, min_rank, max_rank, cutoff_probability) 
SELECT id, 60, 79.9, 1001, 10000, 'Medium' FROM exams;

INSERT OR IGNORE INTO rank_data (exam_id, min_score, max_score, min_rank, max_rank, cutoff_probability) 
SELECT id, 0, 59.9, 10001, 500000, 'Low' FROM exams;
