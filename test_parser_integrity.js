const { parseDigialm } = require('./services/parser');

console.log('Testing Parser Import...');

if (typeof parseDigialm === 'function') {
    console.log('✅ parseDigialm is exported correctly.');
} else {
    console.error('❌ parseDigialm is NOT exported.');
    process.exit(1);
}

// Optional: Mock call (won't work without real URL but checks syntax)
// parseDigialm('http://example.com').catch(e => console.log('✅ Error handling works:', e.message));
