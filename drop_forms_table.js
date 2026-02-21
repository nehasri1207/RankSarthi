const db = require('./database/db');

try {
    console.log('Dropping form_updates table...');
    db.prepare('DROP TABLE IF EXISTS form_updates').run();
    console.log('✅ Table form_updates dropped successfully.');
} catch (error) {
    console.error('❌ Error dropping table:', error);
}
