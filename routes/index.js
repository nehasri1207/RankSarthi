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
    const { q, cat } = req.query;
    let query = 'SELECT * FROM form_updates';
    const params = [];
    const conditions = [];

    // Search Logic
    if (q) {
        conditions.push('(title LIKE ? OR department LIKE ?)');
        const search = `%${q}%`;
        params.push(search, search);
    }

    // Category Filter
    if (cat) {
        conditions.push('category = ?');
        params.push(cat);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const updates = db.prepare(query).all(...params);

    // Group updates for the view
    const groupedUpdates = {
        'Result': updates.filter(u => u.category === 'Result'),
        'Admit Card': updates.filter(u => u.category === 'Admit Card'),
        'Latest Jobs': updates.filter(u => u.category === 'Latest Jobs'),
        'Answer Key': updates.filter(u => u.category === 'Answer Key'),
        'Admission': updates.filter(u => u.category === 'Admission'),
        'Syllabus': updates.filter(u => u.category === 'Syllabus')
    };

    // Get Trending separately (independent of search usually, or filtered too)
    // For now, let's keep trending global or filtered by search if present
    const trending = updates.filter(u => u.is_trending);

    res.render('forms', {
        updates: groupedUpdates,
        trending: trending,
        searchQuery: q || '',
        activeCategory: cat || ''
    });
});

module.exports = router;
