const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { parseDigialm } = require('../services/parser');

// GET /calculator?exam_id=1
router.get('/', (req, res) => {
    const examId = req.query.exam_id;
    if (!examId) return res.redirect('/');
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
    if (!exam) return res.status(404).render('404', { title: 'Exam Not Found' });
    res.render('calculator', {
        title: `Calculate Marks - ${exam.name}`,
        exam: exam,
        error: req.query.error
    });
});

// POST /calculator/parse
router.post('/parse', async (req, res) => {
    const { exam_id, url, category, gender, medium, horizontal_category, state, zone } = req.body;
    console.log('Parse Request:', { exam_id, url }); // DEBUG log

    if (!url) return res.redirect(`/calculator?exam_id=${exam_id}`);

    try {
        const result = await parseDigialm(url);

        console.log('Parser Result:', { correct: result.correct, wrong: result.wrong }); // DEBUG log

        // Base64 encode complex objects for URL compatibility
        const sectionsStr = Buffer.from(JSON.stringify(result.sections)).toString('base64');
        const infoStr = Buffer.from(JSON.stringify(result.candidateInfo)).toString('base64');
        const wrongQuestionsStr = Buffer.from(JSON.stringify(result.wrongQuestions || [])).toString('base64');

        const params = new URLSearchParams({
            exam_id,
            correct: result.correct,
            wrong: result.wrong,
            category,
            gender,
            medium,
            state: state || '',
            zone: zone || '',
            horizontal_category: horizontal_category || '',
            sections: sectionsStr,
            info: infoStr,
            wrongQuestions: wrongQuestionsStr
        });

        res.redirect(`/result?${params.toString()}`);
    } catch (error) {
        console.error("===== PARSER ERROR =====");
        console.error(`URL: ${url}`);
        if (error.response) {
            console.error(`Parser Response Error: ${error.response.status} - ${error.response.statusText}`);
            // console.error(error.response.data); // Uncomment for verbose HTML error body
        }
        console.error(error.stack || error.message);
        console.error("========================");
        res.redirect(`/calculator?exam_id=${exam_id}&error=inv_url`);
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
