const db = require('./database/db');
const fs = require('fs');
const path = require('path');

console.log('--- Verifying Application Forms Feature ---');

// 1. Verify Database Table
try {
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='form_updates'").get();
    if (tableCheck) {
        console.log('✅ Table form_updates exists.');
    } else {
        console.error('❌ Table form_updates does NOT exist.');
        process.exit(1);
    }
} catch (error) {
    console.error('❌ Database check failed:', error.message);
}

// 2. Verify View Files Enties
const viewsToCheck = [
    'views/forms.ejs',
    'views/admin_dashboard.ejs',
    'views/home.ejs',
    'views/partials/header.ejs'
];

viewsToCheck.forEach(file => {
    if (fs.existsSync(path.join(__dirname, file))) {
        console.log(`✅ File ${file} exists.`);
    } else {
        console.error(`❌ File ${file} is missing.`);
    }
});

// 3. Verify Route Logic (Basic Syntax Check by requiring)
try {
    const adminRoutes = require('./routes/admin');
    const indexRoutes = require('./routes/index');
    console.log('✅ Routes files loaded successfully (Syntax checks passed).');
} catch (error) {
    console.error('❌ Route file syntax error:', error.message);
}

console.log('--- Verification Complete ---');
