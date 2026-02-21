const db = require('./database/db');

async function simulateHomePage() {
    try {
        console.log('Fetching exams...');
        const [exams] = await db.query('SELECT * FROM exams');
        console.log('Exams fetched:', exams.length);

        const categorizedExams = {
            'SSC': exams.filter(e => e.category === 'SSC'),
            'Railway': exams.filter(e => e.category === 'Railway'),
            'Banking': exams.filter(e => e.category === 'Banking')
        };
        console.log('Exams categorized.');

        // Simulate rendering (simplified)
        console.log('SSC count:', categorizedExams['SSC'].length);
        console.log('Railway count:', categorizedExams['Railway'].length);
        console.log('Banking count:', categorizedExams['Banking'].length);

        console.log('Success!');
    } catch (err) {
        console.error('SIMULATED Home Page Error:', err);
    } finally {
        process.exit(0);
    }
}

simulateHomePage();
