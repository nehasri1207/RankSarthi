const db = require('./database/db');

try {
    console.log("Checking for zone_normalized_score column...");

    // Check if columns exist
    const columns = db.prepare("PRAGMA table_info(user_results)").all();
    const hasColumn = columns.some(c => c.name === 'zone_normalized_score');

    if (!hasColumn) {
        db.prepare("ALTER TABLE user_results ADD COLUMN zone_normalized_score REAL").run();
        console.log("Added zone_normalized_score column.");
    } else {
        console.log("zone_normalized_score column already exists.");
    }

    console.log("Migration complete.");
} catch (error) {
    console.error("Migration failed:", error);
}
