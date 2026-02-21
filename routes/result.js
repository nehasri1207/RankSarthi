const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.all('/', async (req, res) => {
    let { exam_id, correct, wrong, category, gender, medium, horizontal_category, state, zone, info, sections: sectionsRaw, roll_no, wrongQuestions: wrongQuestionsRaw, url } = { ...req.query, ...req.body };

    if (!exam_id) return res.redirect('/');

    try {
        // --- IN-FLIGHT URL PARSING TO AVOID URI-TOO-LONG ERRORS ---
        if (url) {
            const { parseDigialm } = require('../services/parser');
            try {
                const result = await parseDigialm(url);
                correct = result.correct;
                wrong = result.wrong;
                // Optional: We can still use base64 strings internally to adhere to existing variable handling
                sectionsRaw = Buffer.from(JSON.stringify(result.sections)).toString('base64');
                info = Buffer.from(JSON.stringify(result.candidateInfo)).toString('base64');
                wrongQuestionsRaw = Buffer.from(JSON.stringify(result.wrongQuestions || [])).toString('base64');
            } catch (error) {
                console.error("===== PARSER ERROR =====");
                console.error(`URL: ${url}`);
                if (error.response) console.error(`Response Error: ${error.response.status}`);
                console.error(error.stack || error.message);
                return res.redirect(`/calculator?exam_id=${exam_id}&error=inv_url`);
            }
        }


        // 1. If we have a roll_no but no scores, try to fetch from DB (Quick Check)
        if (roll_no && (correct == null || wrong == null)) {
            const [students] = await db.query('SELECT * FROM user_results WHERE exam_id = ? AND roll_no = ?', [exam_id, roll_no]);
            const student = students[0];

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
                        await db.query('UPDATE user_results SET correct_count = ?, wrong_count = ? WHERE id = ?', [c, w, student.id]);
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

        const [exams] = await db.query('SELECT * FROM exams WHERE id = ?', [exam_id]);
        const exam = exams[0];
        if (!exam) return res.redirect('/');

        const c = parseInt(correct);
        const w = parseInt(wrong);
        const u = exam.total_questions - (c + w);
        const totalScore = parseFloat(((c * exam.marks_per_question) - (w * exam.negative_marks)).toFixed(2));
        const totalAttempts = c + w;
        const accuracy = totalAttempts > 0 ? ((c / totalAttempts) * 100).toFixed(1) : 0;

        // Decode base64 data correctly (UTF8) to avoid parsing corruption on unicode
        let sections = null;
        if (sectionsRaw) {
            try { sections = JSON.parse(Buffer.from(sectionsRaw, 'base64').toString('utf8')); } catch (e) { }
        }

        let candidateInfo = null;
        if (info) {
            try { candidateInfo = JSON.parse(Buffer.from(info, 'base64').toString('utf8')); } catch (e) { }
        }

        let wrongQuestions = null;
        if (wrongQuestionsRaw) {
            try { wrongQuestions = JSON.parse(Buffer.from(wrongQuestionsRaw, 'base64').toString('utf8')); } catch (e) { }
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
                const [existingRows] = await db.query('SELECT id FROM user_results WHERE roll_no = ? AND exam_id = ?', [rollNo, exam_id]);
                const existing = existingRows[0];

                if (existing) {
                    await db.query('UPDATE user_results SET total_score = ?, state = ?, zone = ?, category = ?, sections_data = ?, extra_info = ?, correct_count = ?, wrong_count = ?, wrong_questions_data = ? WHERE id = ?', [totalScore, state, zone, category, sectionsData, extraInfo, c, w, wrongQuestionsData, existing.id]);
                } else {
                    await db.query(`
                        INSERT INTO user_results 
                        (exam_id, roll_no, name, category, gender, medium, horizontal_category, state, zone, exam_date, exam_shift, total_score, sections_data, extra_info, correct_count, wrong_count, wrong_questions_data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        exam_id, rollNo, name, category, gender, medium, horizontal_category, state, zone,
                        date, shift, totalScore, sectionsData, extraInfo, c, w, wrongQuestionsData
                    ]);
                }
            } else {
                // Manual Entry: Save as new anonymous entry
                await db.query(`
                    INSERT INTO user_results 
                    (exam_id, roll_no, name, category, gender, medium, horizontal_category, state, zone, exam_date, exam_shift, total_score, sections_data, correct_count, wrong_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    exam_id, null, 'Manual User', category, gender, medium, horizontal_category, state, zone,
                    'Manual', 'Manual', totalScore, sectionsData, c, w
                ]);
            }
        } catch (err) {
            console.error("Persistence Error:", err);
        }

        // --- REAL-TIME NORMALIZATION TRIGGER ---
        if (exam.is_normalization_visible) {
            try {
                const { triggerRealTimeNormalization } = require('../services/normalization');
                triggerRealTimeNormalization(exam_id);
            } catch (normErr) {
                console.error("Real-time Normalization Error:", normErr);
            }
        }

        // 2. Fetch Rankings
        const [[{ count: overallCount }]] = await db.query('SELECT COUNT(*) as count FROM user_results WHERE exam_id = ?', [exam_id]);
        const [[{ rank_val: overallRankCount }]] = await db.query('SELECT COUNT(*) as rank_val FROM user_results WHERE exam_id = ? AND total_score > ?', [exam_id, totalScore]);
        const overallRank = overallRankCount + 1;

        const [[{ count: categoryCount }]] = await db.query('SELECT COUNT(*) as count FROM user_results WHERE exam_id = ? AND category = ?', [exam_id, category]);
        const [[{ rank_val: categoryRankCount }]] = await db.query('SELECT COUNT(*) as rank_val FROM user_results WHERE exam_id = ? AND category = ? AND total_score > ?', [exam_id, category, totalScore]);
        const categoryRank = categoryRankCount + 1;

        // Zone Rank
        let zoneCount = 0;
        let zoneRank = 0;
        let categoryZoneCount = 0;
        let categoryZoneRank = 0;

        if (zone) {
            const [[{ count: zCount }]] = await db.query('SELECT COUNT(*) as count FROM user_results WHERE exam_id = ? AND zone = ?', [exam_id, zone]);
            zoneCount = zCount;
            const [[{ rank_val: zRankCount }]] = await db.query('SELECT COUNT(*) as rank_val FROM user_results WHERE exam_id = ? AND zone = ? AND total_score > ?', [exam_id, zone, totalScore]);
            zoneRank = zRankCount + 1;

            if (category) {
                const [[{ count: czCount }]] = await db.query('SELECT COUNT(*) as count FROM user_results WHERE exam_id = ? AND zone = ? AND category = ?', [exam_id, zone, category]);
                categoryZoneCount = czCount;
                const [[{ rank_val: czRankCount }]] = await db.query('SELECT COUNT(*) as rank_val FROM user_results WHERE exam_id = ? AND zone = ? AND category = ? AND total_score > ?', [exam_id, zone, category, totalScore]);
                categoryZoneRank = czRankCount + 1;
            }
        }

        // Shift Rank
        const shift = candidateInfo ? candidateInfo.time : 'Manual';
        const date = candidateInfo ? candidateInfo.date : 'Manual';
        const [[{ count: shiftCount }]] = await db.query('SELECT COUNT(*) as count FROM user_results WHERE exam_id = ? AND exam_date = ? AND exam_shift = ?', [exam_id, date, shift]);
        const [[{ rank_val: shiftRankCount }]] = await db.query('SELECT COUNT(*) as rank_val FROM user_results WHERE exam_id = ? AND exam_date = ? AND exam_shift = ? AND total_score > ?', [exam_id, date, shift, totalScore]);
        const shiftRank = shiftRankCount + 1;

        const calculatePercentile = (rank, total) => total > 0 ? (((total - (rank - 1)) / total) * 100).toFixed(2) : "0.00";

        const analytics = {
            overall: { rank: overallRank, total: overallCount, percentile: calculatePercentile(overallRank, overallCount) },
            category: { rank: categoryRank, total: categoryCount, percentile: calculatePercentile(categoryRank, categoryCount) },
            zone: { rank: zoneRank, total: zoneCount, percentile: calculatePercentile(zoneRank, zoneCount) },
            categoryZone: { rank: categoryZoneRank, total: categoryZoneCount, percentile: calculatePercentile(categoryZoneRank, categoryZoneCount) },
            shift: { rank: shiftRank, total: shiftCount, percentile: calculatePercentile(shiftRank, shiftCount) }
        };

        // --- PREDICTION LOGIC ---
        const [predictions] = await db.query('SELECT * FROM rank_data WHERE exam_id = ? AND ? >= min_score AND ? <= max_score', [exam_id, totalScore, totalScore]);
        let prediction = predictions[0];

        if (!prediction) {
            const [[{ highest }]] = await db.query('SELECT max(max_score) as highest FROM rank_data WHERE exam_id = ?', [exam_id]);
            prediction = (totalScore > (highest || 0))
                ? { min_rank: 1, max_rank: 10, cutoff_probability: 'High' }
                : { min_rank: 50000, max_rank: 100000, cutoff_probability: 'Low' };
        }

        // --- FETCH NORMALIZED SCORE ---
        let normalizedScore = null;
        let zoneNormalizedScore = null;
        if (exam.is_normalization_visible) {
            const rNo = candidateInfo ? candidateInfo.rollNo : null;
            if (rNo && rNo !== 'N/A') {
                const [studentRecords] = await db.query('SELECT normalized_score, zone_normalized_score FROM user_results WHERE roll_no = ? AND exam_id = ?', [rNo, exam_id]);
                const studentRecord = studentRecords[0];
                if (studentRecord) {
                    normalizedScore = studentRecord.normalized_score;
                    zoneNormalizedScore = studentRecord.zone_normalized_score;
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
    } catch (err) {
        console.error('Results Page Error:', err);
        res.status(500).send('Internal Server Error');
    }
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
        const [students] = await db.query(`
            SELECT r.*, e.name as exam_name
            FROM user_results r
            JOIN exams e ON r.exam_id = e.id
            WHERE r.exam_id = ? AND r.roll_no = ?
        `, [exam_id, roll_no]);

        const student = students[0];

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
