const fs = require('fs');
const path = require('path');

const filesToDelete = [
    'views/forms.ejs',
    'public/css/modern_portal.css',
    'migrate_portal.js',
    'verify_portal.js',
    'migrate_forms.js',
    'verify_forms.js',
    'drop_forms_table.js' // Delete self later or manually
];

filesToDelete.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            console.log(`✅ Deleted: ${file}`);
        } catch (err) {
            console.error(`❌ Error deleting ${file}:`, err.message);
        }
    } else {
        console.log(`⚠️  File not found (already deleted): ${file}`);
    }
});
