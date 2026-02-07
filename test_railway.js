const { calculateNormalization } = require('./services/normalization');
const db = require('./database/db');

// Mock data setup
function setupRailwayMockData() {
    console.log("Setting up Railway mock data...");

    // 1. Create a dummy Railway exam
    // Use a timestamp to ensure uniqueness and avoid conflicts
    const uniqueName = `Railway Mock Test ${Date.now()}`;

    const examId = db.prepare(`
        INSERT INTO exams (name, category, total_questions, marks_per_question, negative_marks) 
        VALUES (?, 'Railway', 100, 1, 0.33)
    `).run(uniqueName).lastInsertRowid;

    // 2. Create dummy results
    // Shift 1: High Mean (Should be Base Shift if Count is high enough)
    // Shift 2: Low Mean

    // Zone setup: 
    // Shift 1 has candidates from Zone A and Zone B.
    // Shift 2 has candidates from Zone A and Zone B.

    const shift1Scores = [90, 85, 80, 75, 70]; // Avg: 80
    shift1Scores.forEach((score, i) => {
        const zone = i % 2 === 0 ? 'Zone A' : 'Zone B';
        db.prepare(`INSERT INTO user_results (exam_id, roll_no, exam_date, exam_shift, total_score, zone) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(examId, `R_S1_${i}`, '2023-01-01', 'Shift 1', score, zone);
    });

    const shift2Scores = [60, 55, 50, 45, 40]; // Avg: 50
    shift2Scores.forEach((score, i) => {
        const zone = i % 2 === 0 ? 'Zone A' : 'Zone B';
        db.prepare(`INSERT INTO user_results (exam_id, roll_no, exam_date, exam_shift, total_score, zone) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(examId, `R_S2_${i}`, '2023-01-01', 'Shift 2', score, zone);
    });

    // Shift 3 (Small)
    const shift3Scores = [70, 65, 60];
    shift3Scores.forEach((score, i) => {
        const zone = 'Zone C';
        db.prepare(`INSERT INTO user_results (exam_id, roll_no, exam_date, exam_shift, total_score, zone) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(examId, `R_S3_${i}`, '2023-01-01', 'Shift 3', score, zone);
    });

    return examId;
}

try {
    const examId = setupRailwayMockData();
    console.log(`Created Mock Exam ID: ${examId}`);

    // Run Normalization
    calculateNormalization(examId);

    // Check results
    console.log("\n--- VERIFICATION ---");
    const results = db.prepare('SELECT roll_no, exam_shift, zone, total_score, normalized_score, zone_normalized_score FROM user_results WHERE exam_id = ? ORDER BY exam_shift, total_score DESC').all(examId);
    console.table(results);

} catch (e) {
    console.error(e);
}
