const axios = require('axios');
const cheerio = require('cheerio');

async function parseDigialm(url) {
    try {
        const response = await axios.get(url);
        const html = response.data;
        const $ = cheerio.load(html);

        // 0. Extract Candidate Information
        const candidateInfo = {
            rollNo: "N/A",
            name: "Candidate",
            venue: "N/A",
            date: "N/A",
            time: "N/A"
        };

        // Comprehensive label mapping for robustness
        const labelMap = {
            rollNo: ['Roll Number', 'Participant ID', 'Roll No'],
            name: ['Candidate Name', 'Participant Name', 'Name'],
            venue: ['Venue Name', 'Test Center Name', 'Center'],
            date: ['Exam Date', 'Test Date', 'Date'],
            time: ['Exam Time', 'Test Time', 'Time', 'Shift']
        };

        $('table').each((i, table) => {
            const tableText = $(table).text();
            // Check if this table looks like an info table
            if (Object.values(labelMap).flat().some(label => tableText.includes(label))) {
                $(table).find('tr').each((j, tr) => {
                    const cells = $(tr).find('td');
                    if (cells.length >= 2) {
                        const labelText = $(cells[0]).text().trim();
                        const valueText = $(cells[cells.length - 1]).text().trim();

                        for (const [key, labels] of Object.entries(labelMap)) {
                            if (labels.some(l => labelText.includes(l))) {
                                candidateInfo[key] = valueText;
                            }
                        }
                    }
                });
                // If we found at least name or roll number, we probably have the right table
                if (candidateInfo.name !== 'Candidate' || candidateInfo.rollNo !== 'N/A') {
                    return false; // Break loop
                }
            }
        });

        let totalQuestions = 0;
        let correct = 0;
        let wrong = 0;
        let unattempted = 0;

        const sections = {};

        // Iterate over each question panel
        $('.question-pnl').each((i, el) => {
            totalQuestions++;

            // Detect Section Name
            let sectionName = "General";
            const sectionHeader = $(el).prevAll('.section-itxt, .section-cntnr, .section-lbl').first();
            if (sectionHeader.length > 0) {
                sectionName = sectionHeader.text().trim().replace(/[\t\n\r]/gm, " ");
            } else {
                const parentSection = $(el).closest('.section-cntnr').find('.section-itxt').first();
                if (parentSection.length > 0) {
                    sectionName = parentSection.text().trim();
                }
            }
            sectionName = sectionName.replace(/\s\s+/g, ' ');

            if (!sections[sectionName]) {
                sections[sectionName] = { correct: 0, wrong: 0, unattempted: 0, total: 0 };
            }
            sections[sectionName].total++;

            // 1. Get Candidate's Choice
            const rightSideTable = $(el).find('table.menu-tbl');
            const chosenOptionText = rightSideTable.find('tr:contains("Chosen Option") td:last-child').text().trim();
            const isAttempted = chosenOptionText && /^[1-4]$/.test(chosenOptionText);

            if (!isAttempted) {
                unattempted++;
                sections[sectionName].unattempted++;
                return;
            }

            const chosenIndex = parseInt(chosenOptionText);

            // 2. Locate the Option Element
            let questionTable = $(el).find('table.questionRowTbl');
            if (questionTable.length === 0) {
                questionTable = $(el).find('table').not('.menu-tbl').first();
            }

            let optionRows = [];
            questionTable.find('tr').each((idx, row) => {
                const text = $(row).text().trim();
                if (/^[1-4]\./.test(text)) {
                    optionRows.push(row);
                }
            });

            if (optionRows.length < 4) {
                optionRows = [];
                questionTable.find('tr').each((idx, row) => {
                    if ($(row).find('td').length >= 2) {
                        optionRows.push(row);
                    }
                });
                if (optionRows.length > 4) {
                    optionRows = optionRows.slice(optionRows.length - 4);
                }
            }

            if (optionRows.length >= chosenIndex) {
                const chosenRow = optionRows[chosenIndex - 1];
                const rowObj = $(chosenRow);
                const hasTick = rowObj.text().includes('✔');
                const hasCorrectClass = rowObj.find('.correct, .rightAns').length > 0 || rowObj.hasClass('rightAns');
                const hasCorrectImg = rowObj.find('img[alt="Correct"]').length > 0;

                if (hasTick || hasCorrectClass || hasCorrectImg) {
                    correct++;
                    sections[sectionName].correct++;
                } else {
                    wrong++;
                    sections[sectionName].wrong++;
                }
            } else {
                wrong++;
                sections[sectionName].wrong++;
            }
        });

        return {
            candidateInfo,
            totalQuestions,
            correct,
            wrong,
            unattempted,
            sections
        };

    } catch (error) {
        console.error('Parser Error:', error.message);
        throw new Error('Failed to parse URL');
    }
}

module.exports = { parseDigialm };
