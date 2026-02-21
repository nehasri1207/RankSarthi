const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Middleware to check admin session
const requireAdmin = (req, res, next) => {
    if (req.session && req.session.isAdmin) {
        next();
    } else {
        res.redirect('/admin/login');
    }
};

// Login Page
router.get('/login', (req, res) => {
    if (req.session.isAdmin) return res.redirect('/admin/dashboard');
    res.render('admin_login', { title: 'Admin Login', error: null });
});

router.post('/login', (req, res) => {
    const { password } = req.body;
    // RESET PASSWORD: Using a very simple one as requested
    const simplePass = 'admin@123';

    if (password && password.trim() === simplePass) {
        req.session.isAdmin = true;
        res.redirect('/admin/dashboard');
    } else {
        res.render('admin_login', { title: 'Admin Login', error: 'Invalid Password' });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// Dashboard with Analytics
router.get('/dashboard', requireAdmin, async (req, res) => {
    try {
        const [exams] = await db.query('SELECT * FROM exams');

        // Global Analytics
        const [[{ count: totalParticipants }]] = await db.query('SELECT COUNT(*) as count FROM user_results');
        const [[{ avg: avgScore }]] = await db.query('SELECT AVG(total_score) as avg FROM user_results');

        const globalStats = {
            totalParticipants: totalParticipants || 0,
            avgScore: avgScore || 0,
            totalExams: exams.length
        };

        // Exam-wise participation
        const [examStats] = await db.query(`
            SELECT e.id, e.name, COUNT(r.id) as participants, AVG(r.total_score) as avg_score
            FROM exams e
            LEFT JOIN user_results r ON e.id = r.exam_id
            GROUP BY e.id, e.name
        `);

        // Map for easy ID lookup in template
        const exam_id_map = {};
        exams.forEach(e => exam_id_map[e.name] = e.id);

        // Category Distribution (Global)
        const [categoryStats] = await db.query(`
            SELECT category, COUNT(*) as count
            FROM user_results
            GROUP BY category
        `);

        // NEW: Exam + Category Breakdown for Charts
        const [examCategoryStats] = await db.query(`
            SELECT e.name as exam_name, r.category, COUNT(r.id) as count, AVG(r.total_score) as avg_score
            FROM user_results r
            JOIN exams e ON r.exam_id = e.id
            GROUP BY e.name, r.category
            ORDER BY e.name, r.category
        `);

        // Shift Analysis (Toughness check) - Grouped by Exam
        const [shiftStats] = await db.query(`
            SELECT e.name as exam_name, r.exam_date, r.exam_shift, AVG(r.total_score) as avg_score, COUNT(r.id) as count
            FROM user_results r
            JOIN exams e ON r.exam_id = e.id
            GROUP BY e.name, r.exam_date, r.exam_shift
            HAVING count > 0
            ORDER BY e.name, r.exam_date DESC
        `);

        res.render('admin_dashboard', {
            title: 'Admin Dashboard',
            exams,
            globalStats,
            examStats,
            categoryStats,
            examCategoryStats,
            exam_id_map,
            shiftStats
        });
    } catch (err) {
        console.error('Dashboard Error:', err);
        res.status(500).send('Internal Server Error');
    }
});

// NEW: Export Data as CSV
router.get('/export-csv', requireAdmin, async (req, res) => {
    try {
        const [data] = await db.query(`
            SELECT r.*, e.name as exam_name 
            FROM user_results r
            JOIN exams e ON r.exam_id = e.id
        `);

        if (data.length === 0) return res.send("No data to export");

        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(row =>
            Object.values(row).map(val => `"${val}"`).join(',')
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=ranksaarthi_data.csv');
        res.send(`${headers}\n${rows}`);
    } catch (err) {
        console.error('Export Error:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Add Exam
router.post('/add-exam', requireAdmin, async (req, res) => {
    const { name, category, total_questions, marks_per_question, negative_marks } = req.body;
    try {
        await db.query('INSERT INTO exams (name, category, total_questions, marks_per_question, negative_marks) VALUES (?, ?, ?, ?, ?)', [name, category, total_questions, marks_per_question, negative_marks]);
    } catch (err) {
        console.error(err);
    }
    res.redirect('/admin/dashboard');
});

// Add Rank Data
router.post('/add-rank-data', requireAdmin, async (req, res) => {
    const { exam_id, min_score, max_score, min_rank, max_rank, cutoff_probability } = req.body;
    try {
        await db.query('INSERT INTO rank_data (exam_id, min_score, max_score, min_rank, max_rank, cutoff_probability) VALUES (?, ?, ?, ?, ?, ?)', [exam_id, min_score, max_score, min_rank, max_rank, cutoff_probability]);
        res.status(200).send('Success');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
});

// Delete Exam
router.post('/delete-exam', requireAdmin, async (req, res) => {
    const { exam_id } = req.body;
    if (!exam_id) return res.redirect('/admin/dashboard');

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query("DELETE FROM user_results WHERE exam_id = ?", [exam_id]);
        await connection.query("DELETE FROM exams WHERE id = ?", [exam_id]);
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        console.error("Delete Exam Error:", err);
    } finally {
        connection.release();
    }
    res.redirect('/admin/dashboard');
});

// Calculate Normalization
const { calculateNormalization } = require('../services/normalization');
router.post('/normalize-scores', requireAdmin, async (req, res) => {
    const { exam_id } = req.body;
    try {
        await calculateNormalization(exam_id);
    } catch (err) {
        console.error("Normalization Error:", err);
    }
    res.redirect(`/admin/exam/${exam_id}`);
});

// Toggle Normalization Visibility
router.post('/toggle-normalization', requireAdmin, async (req, res) => {
    const { exam_id, is_visible } = req.body;
    try {
        const val = parseInt(is_visible); // 1 or 0

        // If Enabling, Calculate first!
        if (val === 1) {
            await calculateNormalization(exam_id);
        }

        await db.query('UPDATE exams SET is_normalization_visible = ? WHERE id = ?', [val, exam_id]);
    } catch (err) {
        console.error("Toggle Error:", err);
    }
    res.redirect(`/admin/exam/${exam_id}`);
});

// Detailed Exam Analysis
router.get('/exam/:id', requireAdmin, async (req, res) => {
    const examId = req.params.id;
    try {
        const [exams] = await db.query('SELECT * FROM exams WHERE id = ?', [examId]);
        const exam = exams[0];
        if (!exam) return res.redirect('/admin/dashboard');

        // Categorical Data for this specific exam
        const [categoryStats] = await db.query(`
            SELECT category, COUNT(*) as count, AVG(total_score) as avg_score, MAX(total_score) as topper_score
            FROM user_results
            WHERE exam_id = ?
            GROUP BY category
        `, [examId]);

        // Shift Analysis for this exam
        const [shiftStats] = await db.query(`
            SELECT exam_date, exam_shift, AVG(total_score) as avg_score, COUNT(*) as count
            FROM user_results
            WHERE exam_id = ?
            GROUP BY exam_date, exam_shift
            ORDER BY exam_date, exam_shift
        `, [examId]);

        // Recent student results for this exam
        const [studentResults] = await db.query(`
            SELECT id, name, roll_no, category, state, zone, total_score, created_at
            FROM user_results
            WHERE exam_id = ?
            ORDER BY total_score DESC
            LIMIT 100
        `, [examId]);

        // Zone Analysis
        const [zoneStats] = await db.query('SELECT zone, COUNT(*) as count, AVG(total_score) as avg_score, MAX(total_score) as topper_score FROM user_results WHERE exam_id = ? AND zone IS NOT NULL AND zone != ? GROUP BY zone ORDER BY avg_score DESC', [examId, '']);

        // Category Wise Zone Analysis
        const [categoryZoneStats] = await db.query('SELECT zone, category, COUNT(*) as count, AVG(total_score) as avg_score FROM user_results WHERE exam_id = ? AND zone IS NOT NULL AND zone != ? GROUP BY zone, category ORDER BY zone, avg_score DESC', [examId, '']);

        // Marks Distribution Table (5-mark intervals, category-wise)
        const maxMarks = exam.total_marks;
        const categories = ['GENERAL', 'EWS', 'OBC(NCL)', 'SC', 'ST'];
        const marksDistribution = [];

        // Generate score ranges
        for (let score = maxMarks; score >= 0; score -= 5) {
            const row = { score };

            // Optimization: Parallel queries for categories
            const categoryPromises = categories.map(cat =>
                db.query('SELECT COUNT(*) as count FROM user_results WHERE exam_id = ? AND category = ? AND total_score >= ?', [examId, cat, score])
            );

            const categoryResults = await Promise.all(categoryPromises);
            categories.forEach((cat, idx) => {
                row[cat] = categoryResults[idx][0][0].count;
            });

            // Total across all categories
            const [[{ count: totalCount }]] = await db.query('SELECT COUNT(*) as count FROM user_results WHERE exam_id = ? AND total_score >= ?', [examId, score]);
            row.TOTAL = totalCount;

            marksDistribution.push(row);
        }

        res.render('admin_exam_detail', {
            title: `Analysis - ${exam.name}`,
            exam,
            categoryStats,
            shiftStats,
            studentResults,
            zoneStats,
            categoryZoneStats,
            marksDistribution,
            categories
        });
    } catch (err) {
        console.error('Exam Detail Error:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Student Detail View
router.get('/student/:id', requireAdmin, async (req, res) => {
    const studentId = req.params.id;
    try {
        const [students] = await db.query(`
            SELECT r.*, e.name as exam_name, e.marks_per_question, e.negative_marks
            FROM user_results r
            JOIN exams e ON r.exam_id = e.id
            WHERE r.id = ?
        `, [studentId]);

        const student = students[0];

        if (!student) return res.redirect('/admin/dashboard');

        let sections = null;
        if (student.sections_data) {
            try { sections = JSON.parse(student.sections_data); } catch (e) { }
        }

        res.render('admin_student_detail', {
            title: `Student Detail - ${student.name}`,
            student,
            sections
        });
    } catch (err) {
        console.error('Student Detail Error:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
