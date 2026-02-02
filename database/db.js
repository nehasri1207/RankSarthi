const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'ranksaarthi.db');
const db = new Database(dbPath); // Removed verbose logging for performance

// Performance Optimizations for High Load (2000+ Concurrent Users)
// WAL mode allows multiple readers and one writer concurrently
db.pragma('journal_mode = WAL');
// Synchronous = NORMAL is much faster for writes and safe in WAL mode
db.pragma('synchronous = NORMAL');
// Increase cache size for better performance
db.pragma('cache_size = 2000');

// Initialize Schema
const schemaPath = path.join(__dirname, 'schema.sql');
if (fs.existsSync(schemaPath)) {
    const migration = fs.readFileSync(schemaPath, 'utf8');
    db.exec(migration);
}

module.exports = db;
