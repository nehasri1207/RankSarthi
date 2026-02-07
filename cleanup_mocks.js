const db = require('./database/db');

try {
    console.log("Starting cleanup of Mock and Test exams...");

    // Find IDs of exams to delete
    const exams = db.prepare("SELECT id, name FROM exams WHERE name LIKE '%Mock%' OR name LIKE '%Test%' OR name LIKE '%Throttling%'").all();

    if (exams.length === 0) {
        console.log("No mock exams found.");
    } else {
        console.log(`Found ${exams.length} exams to delete:`);
        exams.forEach(e => console.log(`- [${e.id}] ${e.name}`));

        const deleteResults = db.prepare("DELETE FROM user_results WHERE exam_id = ?");
        const deleteExam = db.prepare("DELETE FROM exams WHERE id = ?");

        // Disable FKs temporarily to force cleanup
        db.pragma('foreign_keys = OFF');

        const transaction = db.transaction((examList) => {
            for (const exam of examList) {
                deleteResults.run(exam.id);
                deleteExam.run(exam.id);
            }
        });

        try {
            transaction(exams);
            console.log("Deletion complete.");
        } finally {
            db.pragma('foreign_keys = ON');
        }
    }

} catch (e) {
    console.error("Cleanup failed:", e);
}
