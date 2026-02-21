const db = require('../database/db');

/**
 * Main Entry Point for Normalization
 */
async function calculateNormalization(examId) {
    console.log(`Starting Normalization for Exam ID: ${examId}`);

    try {
        const [rows] = await db.query('SELECT category FROM exams WHERE id = ?', [examId]);
        const exam = rows[0];
        if (!exam) {
            console.error(`Exam ${examId} not found.`);
            return { success: false, message: 'Exam not found.' };
        }

        if (exam.category === 'SSC') {
            return await calculateSSCNormalization(examId);
        } else if (exam.category === 'Railway') {
            return await calculateRailwayNormalization(examId);
        } else {
            console.log(`Normalization skipped: Exam ${examId} is ${exam.category} (Not Supported).`);
            return { success: false, message: 'Only SSC and Railway exams are supported.' };
        }
    } catch (err) {
        console.error('Normalization Entry Error:', err);
        return { success: false, message: 'Internal Server Error' };
    }
}

// ==========================================
// SSC NORMALIZATION
// ==========================================
async function calculateSSCNormalization(examId) {
    const results = await fetchResults(examId);
    if (results.length === 0) return;

    const shifts = groupResultsByShift(results);
    const shiftKeys = Object.keys(shifts);
    const numSessions = shiftKeys.length;
    const candidateData = {};

    // Step 1: Percentile
    shiftKeys.forEach(shift => {
        const candidates = shifts[shift];
        const N = candidates.length;
        candidates.sort((a, b) => b.total_score - a.total_score);

        candidates.forEach(candidate => {
            const m = candidates.filter(c => c.total_score <= candidate.total_score).length;
            const P = (m / N);

            candidateData[candidate.id] = {
                id: candidate.id,
                shift: shift,
                rawScore: candidate.total_score,
                percentile: parseFloat(P.toFixed(8)),
                interpolatedScores: {}
            };
        });
    });

    // Step 2 & 3: Interpolation & Average
    const allCandidates = Object.values(candidateData).sort((a, b) => b.percentile - a.percentile);

    allCandidates.forEach(cand => {
        shiftKeys.forEach(targetShift => {
            if (cand.shift === targetShift) {
                cand.interpolatedScores[targetShift] = cand.rawScore;
            } else {
                const targetCandidates = shifts[targetShift].map(c => candidateData[c.id]);
                targetCandidates.sort((a, b) => b.percentile - a.percentile);

                const P = cand.percentile;
                let p2_cand = null; // upper (> P)
                let p1_cand = null; // lower (<= P)

                for (let i = 0; i < targetCandidates.length; i++) {
                    if (targetCandidates[i].percentile >= P) p2_cand = targetCandidates[i];
                    else { p1_cand = targetCandidates[i]; break; }
                }

                let X = 0;
                if (p1_cand && p2_cand) {
                    const x1 = p1_cand.rawScore; const p1 = p1_cand.percentile;
                    const x2 = p2_cand.rawScore; const p2 = p2_cand.percentile;
                    if (p2 === p1) X = x1;
                    else X = x1 + ((x2 - x1) / (p2 - p1)) * (P - p1);
                } else if (p2_cand) X = p2_cand.rawScore;
                else if (p1_cand) X = p1_cand.rawScore;

                cand.interpolatedScores[targetShift] = X;
            }
        });
    });

    const updates = [];
    allCandidates.forEach(c => {
        let sum = 0;
        shiftKeys.forEach(s => sum += c.interpolatedScores[s]);
        updates.push({
            id: c.id,
            normScore: parseFloat((sum / numSessions).toFixed(5)),
            percentile: parseFloat((c.percentile * 100).toFixed(5))
        });
    });

    await performUpdates(updates);
    console.log("SSC Normalization Complete.");
    return { success: true, count: updates.length };
}

// ==========================================
// RAILWAY NORMALIZATION
// ==========================================
async function calculateRailwayNormalization(examId) {
    console.log("Starting Railway Normalization...");
    const results = await fetchResults(examId);
    if (results.length === 0) return;

    // 1. Overall Normalization
    console.log("--- Overall Calculation ---");
    const overallUpdates = computeRailwayScores(results, 'overall');

    // 2. Zone-wise Normalization
    console.log("--- Zone-wise Calculation ---");
    const zoneUpdates = [];

    const resultsByZone = {};
    results.forEach(r => {
        const z = r.zone || 'Unknown';
        if (!resultsByZone[z]) resultsByZone[z] = [];
        resultsByZone[z].push(r);
    });

    Object.keys(resultsByZone).forEach(zone => {
        if (zone === 'Unknown') return;
        console.log(`Processing Zone: ${zone} (Count: ${resultsByZone[zone].length})`);
        const zUpdates = computeRailwayScores(resultsByZone[zone], 'zone');
        zoneUpdates.push(...zUpdates);
    });

    const finalUpdates = {};
    overallUpdates.forEach(u => {
        finalUpdates[u.id] = { ...u, zoneNormScore: null };
    });

    zoneUpdates.forEach(u => {
        if (finalUpdates[u.id]) {
            finalUpdates[u.id].zoneNormScore = u.normScore;
        } else {
            finalUpdates[u.id] = { id: u.id, normScore: null, percentile: null, zoneNormScore: u.normScore };
        }
    });

    await performRailwayUpdates(Object.values(finalUpdates));
    console.log("Railway Normalization Complete.");
    return { success: true, count: overallUpdates.length };
}

/**
 * Core Railway Logic
 */
function computeRailwayScores(candidateList, context = 'overall') {
    if (candidateList.length === 0) return [];

    const shifts = groupResultsByShift(candidateList);
    const shiftKeys = Object.keys(shifts);

    let globalCandidateCount = 0;
    const shiftStats = [];

    shiftKeys.forEach(shiftKey => {
        const candidates = shifts[shiftKey];
        const count = candidates.length;
        globalCandidateCount += count;

        let sum = 0;
        let max = -Infinity;
        candidates.forEach(c => {
            sum += c.total_score;
            if (c.total_score > max) max = c.total_score;
        });

        shiftStats.push({
            shift: shiftKey,
            count: count,
            mean: sum / count,
            maxScore: max
        });
    });

    const avgShiftCount = globalCandidateCount / shiftKeys.length;
    const countHasThreshold = avgShiftCount * 0.70;

    let eligibleShifts = shiftStats.filter(s => s.count >= countHasThreshold);
    if (eligibleShifts.length === 0) eligibleShifts = shiftStats;

    eligibleShifts.sort((a, b) => {
        if (b.mean !== a.mean) return b.mean - a.mean;
        if (b.maxScore !== a.maxScore) return b.maxScore - a.maxScore;
        return b.count - a.count;
    });

    const baseShift = eligibleShifts[0];
    const baseShiftPercentiles = [];
    const localMeta = {};

    shiftKeys.forEach(shiftKey => {
        const candidates = shifts[shiftKey];
        const N = candidates.length;
        candidates.sort((a, b) => b.total_score - a.total_score);

        candidates.forEach(c => {
            const m = candidates.filter(x => x.total_score <= c.total_score).length;
            const P = (m / N) * 100;
            const P_5 = parseFloat(P.toFixed(5));
            localMeta[c.id] = { percentile: P_5 };

            if (shiftKey === baseShift.shift) {
                baseShiftPercentiles.push({ p: P_5, score: c.total_score });
            }
        });
    });

    baseShiftPercentiles.sort((a, b) => b.p - a.p);
    const uniqueBasePoints = [];
    baseShiftPercentiles.forEach(item => {
        if (uniqueBasePoints.length === 0 || uniqueBasePoints[uniqueBasePoints.length - 1].p !== item.p) {
            uniqueBasePoints.push(item);
        }
    });

    const minBasePercentile = uniqueBasePoints.length > 0 ? uniqueBasePoints[uniqueBasePoints.length - 1].p : 0;
    const updates = [];

    shiftKeys.forEach(shiftKey => {
        const candidates = shifts[shiftKey];
        candidates.forEach(c => {
            let normScore = 0;
            const X = localMeta[c.id].percentile;
            const exactMatch = uniqueBasePoints.find(bp => bp.p === X);

            if (exactMatch) {
                normScore = exactMatch.score;
            } else {
                if (X >= minBasePercentile) {
                    let X2_point = null;
                    let X1_point = null;
                    for (let i = 0; i < uniqueBasePoints.length; i++) {
                        if (uniqueBasePoints[i].p > X) X2_point = uniqueBasePoints[i];
                        else { X1_point = uniqueBasePoints[i]; break; }
                    }

                    if (X2_point && X1_point) {
                        const Y2 = X2_point.score; const Y1 = X1_point.score;
                        const X2_val = X2_point.p; const X1_val = X1_point.p;
                        normScore = ((Y2 - Y1) / (X2_val - X1_val)) * (X - X1_val) + Y1;
                    } else {
                        normScore = X2_point ? X2_point.score : (X1_point ? X1_point.score : 0);
                    }
                } else {
                    const len = uniqueBasePoints.length;
                    if (len >= 2) {
                        const X1_point = uniqueBasePoints[len - 1];
                        const X2_point = uniqueBasePoints[len - 2];
                        const Y1 = X1_point.score; const Y2 = X2_point.score;
                        const X1_val = X1_point.p; const X2_val = X2_point.p;
                        normScore = Y1 - ((Y2 - Y1) / (X2_val - X1_val)) * (X1_val - X);
                    } else {
                        normScore = uniqueBasePoints.length > 0 ? uniqueBasePoints[0].score : 0;
                    }
                }
            }
            updates.push({ id: c.id, normScore: parseFloat(normScore.toFixed(5)), percentile: X });
        });
    });

    return updates;
}

// Helper Functions
async function fetchResults(examId) {
    const [rows] = await db.query(`
        SELECT id, total_score, exam_shift, exam_date, zone
        FROM user_results 
        WHERE exam_id = ? 
        ORDER BY exam_date, exam_shift
    `, [examId]);
    return rows;
}

function groupResultsByShift(results) {
    const shifts = {};
    results.forEach(r => {
        const shiftKey = `${r.exam_date}_${r.exam_shift}`;
        if (!shifts[shiftKey]) shifts[shiftKey] = [];
        shifts[shiftKey].push(r);
    });
    return shifts;
}

async function performUpdates(updates) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        for (const row of updates) {
            await connection.query('UPDATE user_results SET normalized_score = ?, percentile = ? WHERE id = ?', [row.normScore, row.percentile, row.id]);
        }
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

async function performRailwayUpdates(updates) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        for (const row of updates) {
            await connection.query('UPDATE user_results SET normalized_score = ?, percentile = ?, zone_normalized_score = ? WHERE id = ?', [row.normScore, row.percentile, row.zoneNormScore, row.id]);
        }
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

// ==========================================
// THROTTLING & CONCURRENCY CONTROL
// ==========================================
const normalizationState = {};
const COOLDOWN_MS = 30000;

function triggerRealTimeNormalization(examId) {
    if (!normalizationState[examId]) {
        normalizationState[examId] = { isProcessing: false, lastRun: 0 };
    }

    const state = normalizationState[examId];
    const now = Date.now();

    if (state.isProcessing) return;
    if (now - state.lastRun < COOLDOWN_MS) return;

    setImmediate(async () => {
        if (state.isProcessing) return;
        state.isProcessing = true;
        try {
            console.log(`[Norm] Starting Real-Time Update for Exam ${examId}...`);
            await calculateNormalization(examId);
            state.lastRun = Date.now();
            console.log(`[Norm] Finished Update for Exam ${examId}.`);
        } catch (err) {
            console.error(`[Norm] Error updating Exam ${examId}:`, err);
        } finally {
            state.isProcessing = false;
        }
    });
}

module.exports = { calculateNormalization, triggerRealTimeNormalization };
