const { calculateNormalization } = require('./services/normalization');
const db = require('./database/db');

// Mock data setup
async function setupMockData() {
    console.log("Setting up mock data...");

    try {
        // 1. Create a dummy SSC exam
        await db.query('DELETE FROM exams WHERE name = ?', ['SSC Mock Test']);
        const [result] = await db.query(`
            INSERT INTO exams (name, category, total_questions, marks_per_question, negative_marks) 
            VALUES ('SSC Mock Test', 'SSC', 100, 2, 0.5)
        `);
        const examId = result.insertId;

        // 2. Create dummy results
        // Shift 1
        const shift1Scores = [100, 90, 80];
        for (let i = 0; i < shift1Scores.length; i++) {
            await db.query(`INSERT INTO user_results (exam_id, roll_no, exam_date, exam_shift, total_score) VALUES (?, ?, ?, ?, ?)`,
                [examId, `S1_${i}`, '2023-01-01', 'Shift 1', shift1Scores[i]]);
        }

        // Shift 2 (Harder - Lower scores)
        const shift2Scores = [80, 70, 60];
        for (let i = 0; i < shift2Scores.length; i++) {
            await db.query(`INSERT INTO user_results (exam_id, roll_no, exam_date, exam_shift, total_score) VALUES (?, ?, ?, ?, ?)`,
                [examId, `S2_${i}`, '2023-01-01', 'Shift 2', shift2Scores[i]]);
        }

        return examId;
    } catch (err) {
        console.error("Setup Error:", err);
        throw err;
    }
}

async function runTest() {
    try {
        const examId = await setupMockData();
        console.log(`Created Mock Exam ID: ${examId}`);

        // Run Normalization
        await calculateNormalization(examId);

        // Check results
        const [results] = await db.query('SELECT roll_no, total_score, normalized_score, percentile FROM user_results WHERE exam_id = ? ORDER BY roll_no', [examId]);
        console.table(results);

        // Cleanup (Optional - commented out as in original)
        // await db.query('DELETE FROM user_results WHERE exam_id = ?', [examId]);
        // await db.query('DELETE FROM exams WHERE id = ?', [examId]);

    } catch (e) {
        console.error("Test Error:", e);
    } finally {
        process.exit(0);
    }
}

runTest();
