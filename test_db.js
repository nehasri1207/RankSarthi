const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'database', 'ranksaarthi.db'));

try {
    const examId = 1;
    // EXACT SAME QUERY FROM admin.js
    const zoneStats = db.prepare('SELECT zone, COUNT(*) as count, AVG(total_score) as avg_score, MAX(total_score) as topper_score FROM user_results WHERE exam_id = ? AND zone IS NOT NULL AND zone != ? GROUP BY zone ORDER BY avg_score DESC').all(examId, '');
    console.log('Success:', zoneStats.length);
} catch (e) {
    console.error('Error:', e.message);
} finally {
    db.close();
}
