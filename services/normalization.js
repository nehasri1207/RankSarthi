const db = require('../database/db');

/**
 * Main Entry Point for Normalization
 */
function calculateNormalization(examId) {
    console.log(`Starting Normalization for Exam ID: ${examId}`);

    const exam = db.prepare('SELECT category FROM exams WHERE id = ?').get(examId);
    if (!exam) {
        console.error(`Exam ${examId} not found.`);
        return { success: false, message: 'Exam not found.' };
    }

    if (exam.category === 'SSC') {
        return calculateSSCNormalization(examId);
    } else if (exam.category === 'Railway') {
        return calculateRailwayNormalization(examId);
    } else {
        console.log(`Normalization skipped: Exam ${examId} is ${exam.category} (Not Supported).`);
        return { success: false, message: 'Only SSC and Railway exams are supported.' };
    }
}

// ==========================================
// SSC NORMALIZATION
// ==========================================
function calculateSSCNormalization(examId) {
    const results = fetchResults(examId);
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
            const P = (m / N); // 0 to 1 scale for SSC as per formula provided earlier?
            // Actually, usually SSC is also 5 decimal, but keeping previous logic intact.
            // Previous logic: P = m/N.

            candidateData[candidate.id] = {
                id: candidate.id,
                shift: shift,
                rawScore: candidate.total_score,
                percentile: parseFloat(P.toFixed(8)),
                interpolatedScores: {}
            };
        });
    });

    // Step 2: Interpolation & Step 3: Average (Same as existing logic)
    // ... extracting existing logic to helper or duplicating for safety ...
    // Since I have to replace the whole file, I will rewrite it cleanly.

    // Step 2
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
                let p1_cand = null; // lower (<= P) but we need immediate neighbors.

                // Find bounds
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

    // Step 3
    const updates = [];
    allCandidates.forEach(c => {
        let sum = 0;
        shiftKeys.forEach(s => sum += c.interpolatedScores[s]);
        updates.push({
            id: c.id,
            normScore: parseFloat((sum / numSessions).toFixed(5)),
            percentile: parseFloat((c.percentile * 100).toFixed(5)) // Convert to 100 scale for storage
        });
    });

    performUpdates(updates);
    console.log("SSC Normalization Complete.");
    return { success: true, count: updates.length };
}

// ==========================================
// RAILWAY NORMALIZATION
// ==========================================
function calculateRailwayNormalization(examId) {
    console.log("Starting Railway Normalization...");
    const results = fetchResults(examId);
    if (results.length === 0) return;

    // 1. Overall Normalization
    console.log("--- Overall Calculation ---");
    const overallUpdates = computeRailwayScores(results, 'overall');

    // 2. Zone-wise Normalization
    console.log("--- Zone-wise Calculation ---");
    const zoneUpdates = [];

    // Group results by Zone
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

    // Merge Updates
    // overallUpdates has {id, normScore, percentile}
    // zoneUpdates has {id, normScore} (we call it zone_normalized_score)

    const finalUpdates = {};

    overallUpdates.forEach(u => {
        finalUpdates[u.id] = { ...u, zoneNormScore: null };
    });

    zoneUpdates.forEach(u => {
        if (finalUpdates[u.id]) {
            finalUpdates[u.id].zoneNormScore = u.normScore;
        } else {
            // Should not happen if subsets match
            finalUpdates[u.id] = { id: u.id, normScore: null, percentile: null, zoneNormScore: u.normScore };
        }
    });

    performRailwayUpdates(Object.values(finalUpdates));
    console.log("Railway Normalization Complete.");
    return { success: true, count: overallUpdates.length };
}

/**
 * Core Railway Logic
 * @param {Array} candidateList - Array of {id, total_score, exam_shift, exam_date}
 * @returns {Array} List of {id, normScore, percentile}
 */
function computeRailwayScores(candidateList, context = 'overall') {
    if (candidateList.length === 0) return [];

    const shifts = groupResultsByShift(candidateList);
    const shiftKeys = Object.keys(shifts);

    // 1. Calculate Shift Statistics for Base Shift Selection
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

    // Filter shifts eligible for Base Shift
    let eligibleShifts = shiftStats.filter(s => s.count >= countHasThreshold);
    if (eligibleShifts.length === 0) eligibleShifts = shiftStats;

    // Sort to find Base Shift
    eligibleShifts.sort((a, b) => {
        if (b.mean !== a.mean) return b.mean - a.mean;
        if (b.maxScore !== a.maxScore) return b.maxScore - a.maxScore;
        return b.count - a.count;
    });

    const baseShift = eligibleShifts[0];
    // console.log(`[${context}] Base Shift: ${baseShift.shift} (Mean: ${baseShift.mean.toFixed(2)})`);

    // 2. Percentiles & Base Data
    const baseShiftPercentiles = [];

    // Attach percentiles to input list objects (by reference, be careful if shared)
    // To avoid mutation issues across overlapping calls (though objects are same ref), 
    // let's create a local map of id -> {percentile, ...}
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

    // 3. Normalized Marks (Interpolation)
    const updates = [];

    shiftKeys.forEach(shiftKey => {
        const candidates = shifts[shiftKey];

        candidates.forEach(c => {
            let normScore = 0;
            const X = localMeta[c.id].percentile; // Use local calculated percentile

            // Direct Match?
            const exactMatch = uniqueBasePoints.find(bp => bp.p === X);

            if (exactMatch) {
                normScore = exactMatch.score;
            } else {
                if (X >= minBasePercentile) {
                    // Case A: X >= Base Min
                    let X2_point = null; // Higher
                    let X1_point = null; // Lower

                    for (let i = 0; i < uniqueBasePoints.length; i++) {
                        if (uniqueBasePoints[i].p > X) {
                            X2_point = uniqueBasePoints[i];
                        } else {
                            X1_point = uniqueBasePoints[i];
                            break;
                        }
                    }

                    if (X2_point && X1_point) {
                        const Y2 = X2_point.score; // Higher Val
                        const Y1 = X1_point.score; // Lower Val
                        const X2_val = X2_point.p; // Higher %
                        const X1_val = X1_point.p; // Lower %

                        // Formula: N = Y1 + (Y2-Y1)/(X2-X1) * (X-X1)
                        // Wait, my previous formula was slightly different derivation but same linear logic.
                        // Standard: Y = Y1 + (Y2-Y1)/(X2-X1) * (X-X1)
                        // Previous:  normScore = ((Y2 - Y1) / (X2_val - X1_val)) * (X - X1_val) + Y1;
                        // It is the same.

                        normScore = ((Y2 - Y1) / (X2_val - X1_val)) * (X - X1_val) + Y1;
                    } else {
                        normScore = X2_point ? X2_point.score : (X1_point ? X1_point.score : 0);
                    }

                } else {
                    // Case B: X < Base Min
                    const len = uniqueBasePoints.length;
                    if (len >= 2) {
                        const X1_point = uniqueBasePoints[len - 1]; // Lowest
                        const X2_point = uniqueBasePoints[len - 2]; // Second Lowest

                        const Y1 = X1_point.score;
                        const Y2 = X2_point.score;
                        const X1_val = X1_point.p;
                        const X2_val = X2_point.p;

                        // Extrapolation downwards
                        normScore = Y1 - ((Y2 - Y1) / (X2_val - X1_val)) * (X1_val - X);
                    } else {
                        normScore = uniqueBasePoints.length > 0 ? uniqueBasePoints[0].score : 0;
                    }
                }
            }

            updates.push({
                id: c.id,
                normScore: parseFloat(normScore.toFixed(5)),
                percentile: X
            });
        });
    });

    return updates;
}

// Helper Functions
function fetchResults(examId) {
    // UPDATED to fetch 'zone'
    // Ensure 'zone' column exists in user_results or is retrievable. 
    // If migration for `zone_normalized_score` worked, checking `zone` existence is key.
    // Assuming `zone` exists in `user_results` from previous context (Analytics uses it).
    return db.prepare(`
        SELECT id, total_score, exam_shift, exam_date, zone
        FROM user_results 
        WHERE exam_id = ? 
        ORDER BY exam_date, exam_shift
    `).all(examId);
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

function performUpdates(updates) {
    // Updates for SSC
    const updateStmt = db.prepare('UPDATE user_results SET normalized_score = ?, percentile = ? WHERE id = ?');
    const transaction = db.transaction((data) => {
        for (const row of data) {
            updateStmt.run(row.normScore, row.percentile, row.id);
        }
    });
    transaction(updates);
}

function performRailwayUpdates(updates) {
    // Updates for Railway (Includes Zone Score)
    const updateStmt = db.prepare('UPDATE user_results SET normalized_score = ?, percentile = ?, zone_normalized_score = ? WHERE id = ?');
    const transaction = db.transaction((data) => {
        for (const row of data) {
            updateStmt.run(row.normScore, row.percentile, row.zoneNormScore, row.id);
        }
    });
    transaction(updates);
}

// ==========================================
// THROTTLING & CONCURRENCY CONTROL
// ==========================================
const normalizationState = {}; // { examId: { isProcessing: bool, lastRun: number } }
const COOLDOWN_MS = 30000; // 30 Seconds

/**
 * Triggers normalization safely with throttling.
 * This is non-blocking (fire and forget) from the caller's perspective if we wrap it,
 * but since Node is single threaded and sqlite is sync, it will block when it actually runs.
 * Throttling prevents it from running constantly.
 */
function triggerRealTimeNormalization(examId) {
    if (!normalizationState[examId]) {
        normalizationState[examId] = { isProcessing: false, lastRun: 0 };
    }

    const state = normalizationState[examId];
    const now = Date.now();

    // 1. If already running, skip.
    if (state.isProcessing) {
        // console.log(`[Norm] Skipped Exam ${examId}: Already processing.`);
        return;
    }

    // 2. If ran recently (within cooldown), skip.
    if (now - state.lastRun < COOLDOWN_MS) {
        // console.log(`[Norm] Skipped Exam ${examId}: Cooldown active.`);
        return;
    }

    // 3. Execute
    // We wrap in setImmediate to allow the current request to complete its response 
    // before the heavy calculation locks the thread.
    setImmediate(() => {
        // Re-check state inside the callback just in case
        if (state.isProcessing) return;

        state.isProcessing = true;
        try {
            console.log(`[Norm] Starting Real-Time Update for Exam ${examId}...`);
            calculateNormalization(examId);
            state.lastRun = Date.now();
            console.log(`[Norm] Finished Update for Exam ${examId}. Next run allowed in ${COOLDOWN_MS / 1000}s`);
        } catch (err) {
            console.error(`[Norm] Error updating Exam ${examId}:`, err);
        } finally {
            state.isProcessing = false;
        }
    });
}

// ... existing helper functions ...

module.exports = { calculateNormalization, triggerRealTimeNormalization };
