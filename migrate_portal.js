const db = require('./database/db');

console.log("Running migration for Modern Job Portal...");

try {
    // 1. Add 'department' column
    try {
        db.prepare("ALTER TABLE form_updates ADD COLUMN department TEXT").run();
        console.log("✅ Added 'department' column.");
    } catch (e) {
        if (!e.message.includes('duplicate column')) console.error("Error adding 'department':", e.message);
    }

    // 2. Add 'last_date' column
    try {
        db.prepare("ALTER TABLE form_updates ADD COLUMN last_date DATE").run();
        console.log("✅ Added 'last_date' column.");
    } catch (e) {
        if (!e.message.includes('duplicate column')) console.error("Error adding 'last_date':", e.message);
    }

    // 3. Add 'is_trending' column
    try {
        db.prepare("ALTER TABLE form_updates ADD COLUMN is_trending BOOLEAN DEFAULT 0").run();
        console.log("✅ Added 'is_trending' column.");
    } catch (e) {
        if (!e.message.includes('duplicate column')) console.error("Error adding 'is_trending':", e.message);
    }

    // 4. Add 'description' column
    try {
        db.prepare("ALTER TABLE form_updates ADD COLUMN description TEXT").run();
        console.log("✅ Added 'description' column.");
    } catch (e) {
        if (!e.message.includes('duplicate column')) console.error("Error adding 'description':", e.message);
    }

    // Note: SQLite CHECK constraints cannot be easily altered on existing columns.
    // For now, we will just proceed. The app logic will handle the new categories.

    console.log("Migration Complete.");

} catch (error) {
    console.error("Migration Failed:", error.message);
}
