const db = require('./database/db');

async function checkExams() {
    try {
        const [rows] = await db.query('SELECT * FROM exams');
        console.log('Exams count:', rows.length);
        if (rows.length > 0) {
            console.log('First exam:', rows[0]);
        }
    } catch (err) {
        console.error('Check Exams Error:', err.message);
    } finally {
        process.exit(0);
    }
}

checkExams();
