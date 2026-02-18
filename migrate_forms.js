const db = require('./database/db');

console.log("Running migration for form_updates table...");

try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS form_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            category TEXT CHECK(category IN ('Result', 'Admit Card', 'Latest Jobs')) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log("Migration successful: form_updates table created.");
} catch (error) {
    console.error("Migration failed:", error.message);
}
