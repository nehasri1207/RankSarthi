const db = require('./database/db');

async function testQuery() {
    try {
        const examId = 1;
        // SAME QUERY FROM admin.js, adapted for MySQL
        const [zoneStats] = await db.query('SELECT zone, COUNT(*) as count, AVG(total_score) as avg_score, MAX(total_score) as topper_score FROM user_results WHERE exam_id = ? AND zone IS NOT NULL AND zone != ? GROUP BY zone ORDER BY avg_score DESC', [examId, '']);
        console.log('Success - Zone Stats Length:', zoneStats.length);
        if (zoneStats.length > 0) {
            console.log('First Row Sample:', zoneStats[0]);
        }
    } catch (e) {
        console.error('Test Query Error:', e.message);
    } finally {
        // We don't close the pool here because the app might still be using it, 
        // but for a script, we should probably exit
        process.exit(0);
    }
}

testQuery();
