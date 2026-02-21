const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { parseDigialm } = require('../services/parser');

// GET /calculator?exam_id=1
router.get('/', async (req, res) => {
    const examId = req.query.exam_id;
    if (!examId) return res.redirect('/');

    try {
        const [rows] = await db.query('SELECT * FROM exams WHERE id = ?', [examId]);
        const exam = rows[0];

        if (!exam) return res.status(404).render('404', { title: 'Exam Not Found' });

        res.render('calculator', {
            title: `Calculate Marks - ${exam.name}`,
            exam: exam,
            error: req.query.error
        });
    } catch (err) {
        console.error('Calculator GET Error:', err);
        res.status(500).send('Internal Server Error');
    }
});

// POST /calculator/parse  (kept for backward compat, server-fetches the URL)
router.post('/parse', async (req, res) => {
    const { exam_id, url, category, gender, medium, horizontal_category, state, zone } = req.body;
    if (!url) return res.redirect(`/calculator?exam_id=${exam_id}`);
    try {
        const result = await parseDigialm(url);
        const sectionsStr = Buffer.from(JSON.stringify(result.sections)).toString('base64');
        const infoStr = Buffer.from(JSON.stringify(result.candidateInfo)).toString('base64');
        const wrongQuestionsStr = Buffer.from(JSON.stringify(result.wrongQuestions || [])).toString('base64');
        const params = new URLSearchParams({ exam_id, correct: result.correct, wrong: result.wrong, category, gender, medium, state: state || '', zone: zone || '', horizontal_category: horizontal_category || '', sections: sectionsStr, info: infoStr, wrongQuestions: wrongQuestionsStr });
        res.redirect(`/result?${params.toString()}`);
    } catch (error) {
        console.error("Parser Error (server-fetch):", error.message);
        res.redirect(`/calculator?exam_id=${exam_id}&error=inv_url`);
    }
});

// POST /calculator/parse-html  (client sends raw HTML, we parse server-side — avoids cloud IP blocks)
router.post('/parse-html', express.text({ type: '*/*', limit: '5mb' }), (req, res) => {
    try {
        const html = req.body;
        if (!html || html.length < 100) {
            return res.status(400).json({ error: 'No HTML received' });
        }
        const { parseStandardHtml } = require('../services/parser');
        const result = parseStandardHtml(html);
        res.json(result);
    } catch (err) {
        console.error('parse-html error:', err.message);
        res.status(500).json({ error: 'Failed to parse HTML' });
    }
});

// POST /calculator/calculate
router.post('/calculate', (req, res) => {
    const { exam_id, correct, wrong, unattempted, category, gender, medium, horizontal_category, state, zone } = req.body;
    const params = new URLSearchParams({
        exam_id,
        correct,
        wrong,
        category,
        gender,
        medium,
        state: state || '',
        zone: zone || '',
        horizontal_category: horizontal_category || ''
    });
    res.redirect(`/result?${params.toString()}`);
});

module.exports = router;
