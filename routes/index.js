const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', (req, res) => {
    // Fetch all active exams
    const exams = db.prepare('SELECT * FROM exams').all();

    const categorizedExams = {
        'SSC': exams.filter(e => e.category === 'SSC'),
        'Railway': exams.filter(e => e.category === 'Railway'),
        'Banking': exams.filter(e => e.category === 'Banking')
    };

    res.render('home', {
        title: 'RankSaarthi - Home',
        categorizedExams
    });
});

router.get('/forms', (req, res) => {
    const updates = db.prepare('SELECT * FROM form_updates ORDER BY created_at DESC').all();

    // Group updates by category
    const groupedUpdates = {
        'Result': updates.filter(u => u.category === 'Result'),
        'Admit Card': updates.filter(u => u.category === 'Admit Card'),
        'Latest Jobs': updates.filter(u => u.category === 'Latest Jobs')
    };

    res.render('forms', {
        updates: groupedUpdates
    });
});

module.exports = router;
