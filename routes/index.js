const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /
router.get('/', async (req, res) => {
    try {
        console.log('Home Page: Fetching exams...');
        // Fetch all active exams
        const [exams] = await db.query('SELECT * FROM exams');
        console.log('Home Page: Exams fetched:', exams.length);

        const categorizedExams = {
            'SSC': exams.filter(e => e.category === 'SSC'),
            'Railway': exams.filter(e => e.category === 'Railway'),
            'Banking': exams.filter(e => e.category === 'Banking')
        };
        console.log('Home Page: Exams categorized.');

        console.log('Home Page: Rendering home.ejs...');
        res.render('home', {
            title: 'RankSaarthi - Home',
            categorizedExams
        });
        console.log('Home Page: Rendered successfully.');
    } catch (err) {
        console.error('Home Page Error:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
