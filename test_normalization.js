const { calculateNormalization } = require('./services/normalization');
const db = require('./database/db');

// Mock data setup
function setupMockData() {
    console.log("Setting up mock data...");

    // 1. Create a dummy SSC exam
    db.prepare('DELETE FROM exams WHERE name = ?').run('SSC Mock Test');
    const examId = db.prepare(`
        INSERT INTO exams (name, category, total_questions, marks_per_question, negative_marks) 
        VALUES ('SSC Mock Test', 'SSC', 100, 2, 0.5)
    `).run().lastInsertRowid;

    // 2. Create dummy results
    // Shift 1
    const shift1Scores = [100, 90, 80];
    shift1Scores.forEach((score, i) => {
        db.prepare(`INSERT INTO user_results (exam_id, roll_no, exam_date, exam_shift, total_score) VALUES (?, ?, ?, ?, ?)`)
            .run(examId, `S1_${i}`, '2023-01-01', 'Shift 1', score);
    });

    // Shift 2 (Harder - Lower scores)
    const shift2Scores = [80, 70, 60];
    shift2Scores.forEach((score, i) => {
        db.prepare(`INSERT INTO user_results (exam_id, roll_no, exam_date, exam_shift, total_score) VALUES (?, ?, ?, ?, ?)`)
            .run(examId, `S2_${i}`, '2023-01-01', 'Shift 2', score);
    });

    return examId;
}

try {
    const examId = setupMockData();
    console.log(`Created Mock Exam ID: ${examId}`);

    // Run Normalization
    calculateNormalization(examId);

    // Check results
    const results = db.prepare('SELECT roll_no, total_score, normalized_score, percentile FROM user_results WHERE exam_id = ? ORDER BY roll_no').all(examId);
    console.table(results);

    // Cleanup
    // db.prepare('DELETE FROM exams WHERE id = ?').run(examId);
    // db.prepare('DELETE FROM user_results WHERE exam_id = ?').run(examId);

} catch (e) {
    console.error(e);
}
