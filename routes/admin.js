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
router.get('/dashboard', requireAdmin, (req, res) => {
    const exams = db.prepare('SELECT * FROM exams').all();

    // Global Analytics
    const globalStats = {
        totalParticipants: db.prepare('SELECT COUNT(*) as count FROM user_results').get().count,
        avgScore: db.prepare('SELECT AVG(total_score) as avg FROM user_results').get().avg || 0,
        totalExams: exams.length
    };

    // Exam-wise participation
    const examStats = db.prepare(`
        SELECT e.id, e.name, COUNT(r.id) as participants, AVG(r.total_score) as avg_score
        FROM exams e
        LEFT JOIN user_results r ON e.id = r.exam_id
        GROUP BY e.id
    `).all();

    // Map for easy ID lookup in template
    const exam_id_map = {};
    exams.forEach(e => exam_id_map[e.name] = e.id);

    // Category Distribution (Global)
    const categoryStats = db.prepare(`
        SELECT category, COUNT(*) as count
        FROM user_results
        GROUP BY category
    `).all();

    // NEW: Exam + Category Breakdown for Charts
    const examCategoryStats = db.prepare(`
        SELECT e.name as exam_name, r.category, COUNT(r.id) as count, AVG(r.total_score) as avg_score
        FROM user_results r
        JOIN exams e ON r.exam_id = e.id
        GROUP BY r.exam_id, r.category
        ORDER BY e.name, r.category
    `).all();

    // Shift Analysis (Toughness check) - Grouped by Exam
    const shiftStats = db.prepare(`
        SELECT e.name as exam_name, r.exam_date, r.exam_shift, AVG(r.total_score) as avg_score, COUNT(r.id) as count
        FROM user_results r
        JOIN exams e ON r.exam_id = e.id
        GROUP BY r.exam_id, r.exam_date, r.exam_shift
        HAVING count > 0
        ORDER BY e.name, r.exam_date DESC
    `).all();

    res.render('admin_dashboard', {
        title: 'Admin Dashboard',
        exams,
        globalStats,
        examStats,
        categoryStats,
        examCategoryStats,
        exam_id_map, // New
        shiftStats
    });
});

// NEW: Export Data as CSV
router.get('/export-csv', requireAdmin, (req, res) => {
    const data = db.prepare(`
        SELECT r.*, e.name as exam_name 
        FROM user_results r
        JOIN exams e ON r.exam_id = e.id
    `).all();

    if (data.length === 0) return res.send("No data to export");

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row =>
        Object.values(row).map(val => `"${val}"`).join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=ranksaarthi_data.csv');
    res.send(`${headers}\n${rows}`);
});

// Add Exam
router.post('/add-exam', requireAdmin, (req, res) => {
    const { name, category, total_questions, marks_per_question, negative_marks } = req.body;
    try {
        const stmt = db.prepare('INSERT INTO exams (name, category, total_questions, marks_per_question, negative_marks) VALUES (?, ?, ?, ?, ?)');
        stmt.run(name, category, total_questions, marks_per_question, negative_marks);
    } catch (err) {
        console.error(err);
    }
    res.redirect('/admin/dashboard');
});

// Add Rank Data
router.post('/add-rank-data', requireAdmin, (req, res) => {
    const { exam_id, min_score, max_score, min_rank, max_rank, cutoff_probability } = req.body;
    try {
        const stmt = db.prepare('INSERT INTO rank_data (exam_id, min_score, max_score, min_rank, max_rank, cutoff_probability) VALUES (?, ?, ?, ?, ?, ?)');
        stmt.run(exam_id, min_score, max_score, min_rank, max_rank, cutoff_probability);
    } catch (err) {
        console.error(err);
    }
    res.redirect('/admin/dashboard');
});

// Detailed Exam Analysis
router.get('/exam/:id', requireAdmin, (req, res) => {
    const examId = req.params.id;
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
    if (!exam) return res.redirect('/admin/dashboard');

    // Categorical Data for this specific exam
    const categoryStats = db.prepare(`
        SELECT category, COUNT(*) as count, AVG(total_score) as avg_score, MAX(total_score) as topper_score
        FROM user_results
        WHERE exam_id = ?
        GROUP BY category
    `).all(examId);

    // Shift Analysis for this exam
    const shiftStats = db.prepare(`
        SELECT exam_date, exam_shift, AVG(total_score) as avg_score, COUNT(*) as count
        FROM user_results
        WHERE exam_id = ?
        GROUP BY exam_date, exam_shift
        ORDER BY exam_date, exam_shift
    `).all(examId);

    // Recent student results for this exam
    const studentResults = db.prepare(`
        SELECT id, name, roll_no, category, state, zone, total_score, created_at
        FROM user_results
        WHERE exam_id = ?
        ORDER BY total_score DESC
        LIMIT 100
    `).all(examId);

    // Zone Analysis
    const zoneStats = db.prepare('SELECT zone, COUNT(*) as count, AVG(total_score) as avg_score, MAX(total_score) as topper_score FROM user_results WHERE exam_id = ? AND zone IS NOT NULL AND zone != ? GROUP BY zone ORDER BY avg_score DESC').all(examId, '');

    // Category Wise Zone Analysis (Top 3 for each zone)
    const categoryZoneStats = db.prepare('SELECT zone, category, COUNT(*) as count, AVG(total_score) as avg_score FROM user_results WHERE exam_id = ? AND zone IS NOT NULL AND zone != ? GROUP BY zone, category ORDER BY zone, avg_score DESC').all(examId, '');

    // Marks Distribution Table (5-mark intervals, category-wise)
    const maxMarks = exam.total_marks;
    const categories = ['GENERAL', 'EWS', 'OBC(NCL)', 'SC', 'ST'];
    const marksDistribution = [];

    // Generate score ranges from max to 0 with 5-mark intervals
    for (let score = maxMarks; score >= 0; score -= 5) {
        const row = { score };

        // For each category, count students who scored >= this score
        categories.forEach(category => {
            const count = db.prepare(`
                SELECT COUNT(*) as count 
                FROM user_results 
                WHERE exam_id = ? AND category = ? AND total_score >= ?
            `).get(examId, category, score);
            row[category] = count.count;
        });

        // Total across all categories
        const total = db.prepare(`
            SELECT COUNT(*) as count 
            FROM user_results 
            WHERE exam_id = ? AND total_score >= ?
        `).get(examId, score);
        row.TOTAL = total.count;

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
});

// Student Detail View
router.get('/student/:id', requireAdmin, (req, res) => {
    const studentId = req.params.id;
    const student = db.prepare(`
        SELECT r.*, e.name as exam_name, e.marks_per_question, e.negative_marks
        FROM user_results r
        JOIN exams e ON r.exam_id = e.id
        WHERE r.id = ?
    `).get(studentId);

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
});

module.exports = router;
