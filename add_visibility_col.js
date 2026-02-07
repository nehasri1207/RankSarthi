const db = require('./database/db');

try {
    console.log("Checking for is_normalization_visible column...");

    // Check if columns exist
    const columns = db.prepare("PRAGMA table_info(exams)").all();
    const hasColumn = columns.some(c => c.name === 'is_normalization_visible');

    if (!hasColumn) {
        db.prepare("ALTER TABLE exams ADD COLUMN is_normalization_visible INTEGER DEFAULT 0").run();
        console.log("Added is_normalization_visible column (Default 0).");
    } else {
        console.log("is_normalization_visible column already exists.");
    }

    console.log("Migration complete.");
} catch (error) {
    console.error("Migration failed:", error);
}
