const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', (req, res) => {
    const { exam_id, correct, wrong, category, gender, medium, horizontal_category, state, zone, info, sections: sectionsRaw } = req.query;
    if (!exam_id || correct === undefined || wrong === undefined) return res.redirect('/');

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

    // --- REAL-TIME ANALYTICS & PERSISTENCE ---
    try {
        const rollNo = candidateInfo ? candidateInfo.rollNo : null;
        const name = candidateInfo ? candidateInfo.name : 'Anonymous Student';
        const shift = candidateInfo ? candidateInfo.time : 'Manual';
        const date = candidateInfo ? candidateInfo.date : 'Manual';

        if (rollNo && rollNo !== 'N/A') {
            // Parsed URL: Use Roll Number to Upsert (Avoid Duplicates)
            const existing = db.prepare('SELECT id FROM user_results WHERE roll_no = ? AND exam_id = ?').get(rollNo, exam_id);
            if (existing) {
                db.prepare('UPDATE user_results SET total_score = ?, state = ?, zone = ?, category = ? WHERE id = ?').run(totalScore, state, zone, category, existing.id);
            } else {
                db.prepare(`
                    INSERT INTO user_results 
                    (exam_id, roll_no, name, category, gender, medium, horizontal_category, state, zone, exam_date, exam_shift, total_score)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    exam_id, rollNo, name, category, gender, medium, horizontal_category, state, zone,
                    date, shift, totalScore
                );
            }
        } else {
            // Manual Entry: Save as new anonymous entry to update charts in real-time
            db.prepare(`
                INSERT INTO user_results 
                (exam_id, roll_no, name, category, gender, medium, horizontal_category, state, zone, exam_date, exam_shift, total_score)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                exam_id, null, 'Manual User', category, gender, medium, horizontal_category, state, zone,
                'Manual', 'Manual', totalScore
            );
        }
    } catch (err) {
        console.error("Persistence Error:", err);
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

    const maskData = (str, type) => {
        if (!str || str === 'N/A' || str === 'Manual User') return str;
        if (str.length <= 2) return str;
        if (type === 'name') {
            const parts = str.split(' ');
            return parts.map(p => p[0] + '*'.repeat(Math.max(0, p.length - 2)) + (p.length > 1 ? p[p.length - 1] : '')).join(' ');
        }
        return str[0] + '*'.repeat(str.length - 2) + str[str.length - 1];
    };

    if (candidateInfo) {
        candidateInfo.name = maskData(candidateInfo.name, 'name');
        candidateInfo.rollNo = maskData(candidateInfo.rollNo, 'roll');
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
        results: { totalScore, accuracy, prediction, sections, candidateInfo, analytics }
    });
});

module.exports = router;
