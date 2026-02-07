const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', (req, res) => {
    let { exam_id, correct, wrong, category, gender, medium, horizontal_category, state, zone, info, sections: sectionsRaw, roll_no, wrongQuestions: wrongQuestionsRaw } = req.query;

    if (!exam_id) return res.redirect('/');

    // 1. If we have a roll_no but no scores, try to fetch from DB (Quick Check)
    if (roll_no && (correct == null || wrong == null)) {
        const student = db.prepare('SELECT * FROM user_results WHERE exam_id = ? AND roll_no = ?').get(exam_id, roll_no);

        if (student) {
            // Try to get correct/wrong from database
            if (student.correct_count !== null && student.wrong_count !== null) {
                correct = student.correct_count;
                wrong = student.wrong_count;
            } else if (student.sections_data) {
                // Fallback: Calculate from sections_data if correct_count is missing
                try {
                    const sections = JSON.parse(student.sections_data);
                    let c = 0, w = 0;
                    sections.forEach(section => {
                        c += section.correct || 0;
                        w += section.wrong || 0;
                    });
                    correct = c;
                    wrong = w;
                    // Update the database with calculated values
                    db.prepare('UPDATE user_results SET correct_count = ?, wrong_count = ? WHERE id = ?')
                        .run(c, w, student.id);
                } catch (e) {
                    console.error('Failed to parse sections_data:', e);
                }
            }

            if (correct !== null && wrong !== null) {
                category = category || student.category;
                gender = gender || student.gender;
                medium = medium || student.medium;
                horizontal_category = horizontal_category || student.horizontal_category;
                state = state || student.state;
                zone = zone || student.zone;

                if (student.sections_data && !sectionsRaw) {
                    try {
                        const sectionsObj = JSON.parse(student.sections_data);
                        sectionsRaw = Buffer.from(JSON.stringify(sectionsObj)).toString('base64');
                    } catch (e) { }
                }
                if (student.extra_info && !info) {
                    try {
                        const infoObj = JSON.parse(student.extra_info);
                        info = Buffer.from(JSON.stringify(infoObj)).toString('base64');
                    } catch (e) { }
                }
                console.log(`Quick check successful for roll ${roll_no}: correct=${correct}, wrong=${wrong}`);
            } else {
                console.log(`Quick check failed: Cannot determine scores for roll ${roll_no}`);
                return res.redirect('/');
            }
        } else {
            console.log(`Quick check failed: Student not found for roll ${roll_no}, exam ${exam_id}`);
            return res.redirect('/');
        }
    }

    if (correct == null || wrong == null) {
        console.log('Redirecting: correct or wrong is null');
        return res.redirect('/');
    }

    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(exam_id);
    if (!exam) return res.redirect('/');

    const c = parseInt(correct);
    const w = parseInt(wrong);
    const u = exam.total_questions - (c + w);
    const totalScore = parseFloat(((c * exam.marks_per_question) - (w * exam.negative_marks)).toFixed(2));
    const totalAttempts = c + w;
    const accuracy = totalAttempts > 0 ? ((c / totalAttempts) * 100).toFixed(1) : 0;

    // Decode base64 data
    let sections = null;
    if (sectionsRaw) {
        try { sections = JSON.parse(Buffer.from(sectionsRaw, 'base64').toString('ascii')); } catch (e) { }
    }

    let candidateInfo = null;
    if (info) {
        try { candidateInfo = JSON.parse(Buffer.from(info, 'base64').toString('ascii')); } catch (e) { }
    }

    let wrongQuestions = null;
    if (wrongQuestionsRaw) {
        try { wrongQuestions = JSON.parse(Buffer.from(wrongQuestionsRaw, 'base64').toString('ascii')); } catch (e) { }
    }

    // --- REAL-TIME ANALYTICS & PERSISTENCE ---
    try {
        const rollNo = candidateInfo ? candidateInfo.rollNo : null;
        const name = candidateInfo ? candidateInfo.name : 'Anonymous Student';
        const shift = candidateInfo ? candidateInfo.time : 'Manual';
        const date = candidateInfo ? candidateInfo.date : 'Manual';
        const sectionsData = sections ? JSON.stringify(sections) : null;
        const extraInfo = candidateInfo ? JSON.stringify(candidateInfo) : null;
        const wrongQuestionsData = wrongQuestions ? JSON.stringify(wrongQuestions) : null;

        if (rollNo && rollNo !== 'N/A') {
            // Parsed URL: Use Roll Number to Upsert (Avoid Duplicates)
            const existing = db.prepare('SELECT id FROM user_results WHERE roll_no = ? AND exam_id = ?').get(rollNo, exam_id);
            if (existing) {
                db.prepare('UPDATE user_results SET total_score = ?, state = ?, zone = ?, category = ?, sections_data = ?, extra_info = ?, correct_count = ?, wrong_count = ?, wrong_questions_data = ? WHERE id = ?').run(totalScore, state, zone, category, sectionsData, extraInfo, c, w, wrongQuestionsData, existing.id);
            } else {
                db.prepare(`
                    INSERT INTO user_results 
                    (exam_id, roll_no, name, category, gender, medium, horizontal_category, state, zone, exam_date, exam_shift, total_score, sections_data, extra_info, correct_count, wrong_count, wrong_questions_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    exam_id, rollNo, name, category, gender, medium, horizontal_category, state, zone,
                    date, shift, totalScore, sectionsData, extraInfo, c, w, wrongQuestionsData
                );
            }
        } else {
            // Manual Entry: Save as new anonymous entry to update charts in real-time
            db.prepare(`
                INSERT INTO user_results 
                (exam_id, roll_no, name, category, gender, medium, horizontal_category, state, zone, exam_date, exam_shift, total_score, sections_data, correct_count, wrong_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                exam_id, null, 'Manual User', category, gender, medium, horizontal_category, state, zone,
                'Manual', 'Manual', totalScore, sectionsData, c, w
            );
        }
    } catch (err) {
        console.error("Persistence Error:", err);
    }

    // --- REAL-TIME NORMALIZATION TRIGGER ---
    // If normalization is enabled for this exam, recalculate immediately so the student sees their normalized score.
    if (exam.is_normalization_visible) {
        try {
            const { triggerRealTimeNormalization } = require('../services/normalization');
            // triggers background throttled calculation
            triggerRealTimeNormalization(exam_id);
        } catch (normErr) {
            console.error("Real-time Normalization Error:", normErr);
        }
    }

    // 2. Fetch Rankings (Based on all saved data)
    const overallCount = db.prepare('SELECT COUNT(*) as count FROM user_results WHERE exam_id = ?').get(exam_id).count;
    const overallRank = db.prepare('SELECT COUNT(*) as rank FROM user_results WHERE exam_id = ? AND total_score > ?').get(exam_id, totalScore).rank + 1;

    const categoryCount = db.prepare('SELECT COUNT(*) as count FROM user_results WHERE exam_id = ? AND category = ?').get(exam_id, category).count;
    const categoryRank = db.prepare('SELECT COUNT(*) as rank FROM user_results WHERE exam_id = ? AND category = ? AND total_score > ?').get(exam_id, category, totalScore).rank + 1;

    // Zone Rank (New)
    let zoneCount = 0;
    let zoneRank = 0;
    let categoryZoneCount = 0;
    let categoryZoneRank = 0;

    if (zone) {
        zoneCount = db.prepare('SELECT COUNT(*) as count FROM user_results WHERE exam_id = ? AND zone = ?').get(exam_id, zone).count;
        zoneRank = db.prepare('SELECT COUNT(*) as rank FROM user_results WHERE exam_id = ? AND zone = ? AND total_score > ?').get(exam_id, zone, totalScore).rank + 1;

        // Category Wise Zone Rank
        if (category) {
            categoryZoneCount = db.prepare('SELECT COUNT(*) as count FROM user_results WHERE exam_id = ? AND zone = ? AND category = ?').get(exam_id, zone, category).count;
            categoryZoneRank = db.prepare('SELECT COUNT(*) as rank FROM user_results WHERE exam_id = ? AND zone = ? AND category = ? AND total_score > ?').get(exam_id, zone, category, totalScore).rank + 1;
        }
    }

    // Shift Rank (only relevant for parsed entries, fallback for manual)
    const shift = candidateInfo ? candidateInfo.time : 'Manual';
    const date = candidateInfo ? candidateInfo.date : 'Manual';
    const shiftCount = db.prepare('SELECT COUNT(*) as count FROM user_results WHERE exam_id = ? AND exam_date = ? AND exam_shift = ?').get(exam_id, date, shift).count;
    const shiftRank = db.prepare('SELECT COUNT(*) as rank FROM user_results WHERE exam_id = ? AND exam_date = ? AND exam_shift = ? AND total_score > ?').get(exam_id, date, shift, totalScore).rank + 1;

    // Percentile = ((N - Rank) / N) * 100
    const calculatePercentile = (rank, total) => total > 0 ? (((total - (rank - 1)) / total) * 100).toFixed(2) : "0.00";

    const analytics = {
        overall: { rank: overallRank, total: overallCount, percentile: calculatePercentile(overallRank, overallCount) },
        category: { rank: categoryRank, total: categoryCount, percentile: calculatePercentile(categoryRank, categoryCount) },
        zone: { rank: zoneRank, total: zoneCount, percentile: calculatePercentile(zoneRank, zoneCount) },
        categoryZone: { rank: categoryZoneRank, total: categoryZoneCount, percentile: calculatePercentile(categoryZoneRank, categoryZoneCount) },
        shift: { rank: shiftRank, total: shiftCount, percentile: calculatePercentile(shiftRank, shiftCount) }
    };

    // --- PREDICTION LOGIC ---
    let prediction = db.prepare('SELECT * FROM rank_data WHERE exam_id = ? AND ? >= min_score AND ? <= max_score').get(exam_id, totalScore, totalScore);
    if (!prediction) {
        const maxData = db.prepare('SELECT max(max_score) as highest FROM rank_data WHERE exam_id = ?').get(exam_id);
        prediction = (totalScore > (maxData.highest || 0))
            ? { min_rank: 1, max_rank: 10, cutoff_probability: 'High' }
            : { min_rank: 50000, max_rank: 100000, cutoff_probability: 'Low' };
    }

    // --- FETCH NORMALIZED SCORE ---
    let normalizedScore = null;
    let zoneNormalizedScore = null;
    // Check if feature is enabled for this exam
    // exam object is already fetched above
    if (exam.is_normalization_visible) { // Check visibility flag
        const rNo = candidateInfo ? candidateInfo.rollNo : null;
        if (rNo && rNo !== 'N/A') {
            const studentRecord = db.prepare('SELECT normalized_score, zone_normalized_score FROM user_results WHERE roll_no = ? AND exam_id = ?').get(rNo, exam_id);
            if (studentRecord) {
                if (studentRecord.normalized_score != null) {
                    normalizedScore = studentRecord.normalized_score;
                }
                if (studentRecord.zone_normalized_score != null) {
                    zoneNormalizedScore = studentRecord.zone_normalized_score;
                }
            }
        }
    }

    res.render('result', {
        title: 'Result Analysis - RankSaarthi',
        exam,
        inputs: {
            c, w, u, totalAttempts,
            category,
            gender,
            medium,
            horizontal_category,
            state,
            zone
        },
        results: { totalScore, normalizedScore, zoneNormalizedScore, accuracy, prediction, sections, candidateInfo, analytics, wrongQuestions }
    });
});

// PDF Download Route
router.get('/download-wrong-questions-pdf', async (req, res) => {
    const { exam_id, roll_no } = req.query;

    if (!exam_id || !roll_no) {
        return res.status(400).send('Missing parameters');
    }

    try {
        const { generateWrongQuestionsPDF } = require('../services/pdfGenerator');

        // Fetch student data from database
        const student = db.prepare(`
            SELECT r.*, e.name as exam_name
            FROM user_results r
            JOIN exams e ON r.exam_id = e.id
            WHERE r.exam_id = ? AND r.roll_no = ?
        `).get(exam_id, roll_no);

        if (!student || !student.wrong_questions_data) {
            return res.status(404).send('No wrong questions data found');
        }

        const wrongQuestions = JSON.parse(student.wrong_questions_data);
        const candidateInfo = student.extra_info ? JSON.parse(student.extra_info) : { name: student.name, rollNo: student.roll_no };

        // Generate PDF
        const { filepath, filename } = await generateWrongQuestionsPDF(wrongQuestions, candidateInfo, student.exam_name);

        // Send PDF file
        res.download(filepath, `Wrong-Questions-${student.exam_name.replace(/\s+/g, '-')}.pdf`, (err) => {
            // Delete temp file after sending
            if (err) {
                console.error('Download error:', err);
            }
            try {
                const fs = require('fs');
                fs.unlinkSync(filepath);
            } catch (e) {
                console.error('Error deleting temp file:', e);
            }
        });

    } catch (error) {
        console.error('PDF Generation Error:', error);
        res.status(500).send('Error generating PDF');
    }
});

module.exports = router;
