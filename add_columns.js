const db = require('./database/db');

try {
    console.log("Adding normalized_score and percentile columns...");

    // Check if columns exist
    const columns = db.prepare("PRAGMA table_info(user_results)").all();
    const hasNormalized = columns.some(c => c.name === 'normalized_score');
    const hasPercentile = columns.some(c => c.name === 'percentile');

    if (!hasNormalized) {
        db.prepare("ALTER TABLE user_results ADD COLUMN normalized_score REAL").run();
        console.log("Added normalized_score column.");
    } else {
        console.log("normalized_score column already exists.");
    }

    if (!hasPercentile) {
        db.prepare("ALTER TABLE user_results ADD COLUMN percentile REAL").run();
        console.log("Added percentile column.");
    } else {
        console.log("percentile column already exists.");
    }

    console.log("Migration complete.");
} catch (error) {
    console.error("Migration failed:", error);
}
