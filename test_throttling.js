const { triggerRealTimeNormalization } = require('./services/normalization');
const db = require('./database/db');

// Mock a simple exam
const uniqueName = `Throttling Test ${Date.now()}`;
const examId = db.prepare(`
    INSERT INTO exams (name, category, total_questions, marks_per_question, negative_marks) 
    VALUES (?, 'SSC', 100, 2, 0.5)
`).run(uniqueName).lastInsertRowid;

console.log(`Created Exam ${examId} for throttling test.`);

console.log("Attempting to trigger 5 times rapidly...");

for (let i = 0; i < 5; i++) {
    console.log(`Trigger Attempt ${i + 1}`);
    triggerRealTimeNormalization(examId);
}

console.log("Waiting for async executions...");
setTimeout(() => {
    console.log("Test finished. Check logs above. You should see '[Norm] Starting...' ONLY ONCE.");
}, 2000);
