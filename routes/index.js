const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', (req, res) => {
    const exams = db.prepare('SELECT * FROM exams ORDER BY name ASC').all();

    // Group by category
    const categorizedExams = {
        'SSC': [],
        'Railway': [],
        'Banking': [],
        'Other': []
    };

    exams.forEach(exam => {
        if (categorizedExams[exam.category]) {
            categorizedExams[exam.category].push(exam);
        } else {
            categorizedExams['Other'].push(exam);
        }
    });

    res.render('home', {
        title: 'RankSaarthi - Home',
        categorizedExams: categorizedExams
    });
});

module.exports = router;
