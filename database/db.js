const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ranksaarthi',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true // Required for initializing schema with multiple queries
});

// Initialize Schema (Async)
async function initializeSchema() {
    try {
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            // Note: MySQL requires multipleStatements: true for this to work
            await pool.query(schema);
            console.log('MySQL Schema Initialized.');
        }
    } catch (err) {
        console.error('Failed to initialize MySQL schema:', err.message);
        // We don't exit here as the DB might already be initialized or password might be missing
    }
}

// Trigger initialization
initializeSchema();

module.exports = pool;
