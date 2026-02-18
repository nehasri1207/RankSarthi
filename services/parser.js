const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');

async function parseDigialm(url) {
    if (url.includes('sscexam.cbexams.com')) {
        return await parseSSC(url);
    } else {
        return await parseStandardDigialm(url);
    }
}



async function parseSSC(url) {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'max-age=0',
            'Upgrade-Insecure-Requests': '1',
            'Referer': 'https://sscexam.cbexams.com/', // Generic Referer
        };

        // 1. Fetch Part A
        const responseA = await axios.get(url, { headers, withCredentials: true });

        // Extract cookies
        let cookies = [];
        if (responseA.headers['set-cookie']) {
            cookies = responseA.headers['set-cookie'];
        }
        const cookieHeader = cookies.join('; ');

        let htmlContent = responseA.data;
        let $ = cheerio.load(htmlContent);

        const candidateInfo = extractSSCCandidateInfo($);

        // Prepare to fetch other parts
        const viewState = $('#__VIEWSTATE').val();
        const viewStateGenerator = $('#__VIEWSTATEGENERATOR').val();
        const eventValidation = $('#__EVENTVALIDATION').val();

        // If we have these, we can try to fetch other parts
        if (viewState && eventValidation) {
            const parts = [
                { id: 'P2', name: 'PART-B' },
                { id: 'P3', name: 'PART-C' },
                { id: 'P4', name: 'PART-D' }
            ];

            for (const part of parts) {
                // Check if button exists (it might not if exam doesn't have 4 parts, though SSC CGL usually does)
                // Actually, checking if button exists in Part A HTML is good
                if ($(`#${part.id}`).length > 0) {
                    try {
                        const formData = {
                            '__VIEWSTATE': viewState,
                            '__VIEWSTATEGENERATOR': viewStateGenerator,
                            '__EVENTVALIDATION': eventValidation,
                            [part.id]: `Click Here for ${part.name}`
                        };

                        const responsePart = await axios.post(url, qs.stringify(formData), {
                            headers: {
                                ...headers,
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Cookie': cookieHeader,
                                'Origin': 'https://sscexam.cbexams.com',
                                'Referer': url
                            },
                            maxRedirects: 5
                        });

                        htmlContent += "\n<!-- SECTION BREAK -->\n" + responsePart.data;
                    } catch (err) {
                        console.error(`Failed to fetch ${part.name}:`, err.message);
                    }
                }
            }
        }

        // Reload all content
        $ = cheerio.load(htmlContent);

        return extractSSCQuestions($, candidateInfo);

    } catch (error) {
        if (error.response) {
            console.error(`SSC Parser Error: Status ${error.response.status}`, error.response.statusText);
        } else {
            console.error('SSC Parser Error:', error.message);
        }
        throw new Error('Failed to parse SSC URL');
    }
}

function extractSSCCandidateInfo($) {
    const candidateInfo = {
        rollNo: "N/A",
        name: "Candidate",
        venue: "N/A",
        date: "N/A",
        time: "N/A"
    };

    // SSC often puts info in a specific table structure
    // We look for rows containing key labels
    $('table').each((i, table) => {
        if ($(table).text().includes('Roll No')) {
            $(table).find('tr').each((j, tr) => {
                const text = $(tr).text();
                // Improved cleaning: replace all colons and trim
                if (text.includes('Roll No')) candidateInfo.rollNo = $(tr).find('td').last().text().replace(/:/g, '').trim();
                if (text.includes('Candidate Name')) candidateInfo.name = $(tr).find('td').last().text().replace(/:/g, '').trim();
                if (text.includes('Test Date')) candidateInfo.date = $(tr).find('td').last().text().replace(/:/g, '').trim();
                if (text.includes('Test Time')) candidateInfo.time = $(tr).find('td').last().text().replace(/:/g, '').trim();
                if (text.includes('Centre Name') || text.includes('Venue Name')) candidateInfo.venue = $(tr).find('td').last().text().replace(/:/g, '').trim();
            });
        }
    });

    return candidateInfo;
}

function extractSSCQuestions($, candidateInfo) {
    let totalQuestions = 0;
    let correct = 0;
    let wrong = 0;
    let unattempted = 0;
    const sections = {};
    const wrongQuestions = [];

    // SSC sections usually labeled clearly
    // In the raw HTML, sections might be denoted by "PART-A", "PART-B" text or similar
    // The previous structure analysis showed: <span id="lblsubject" class="auto-style2">PART-A (General Intelligence and Reasoning)</span>

    // We can iterate over tables that look like questions.
    // Structure: 
    // Q.No: 1 ...
    // Option 1 ... Option 2 ... Option 3 ... Option 4 ...
    // Answer Status row (yellow/green bg)

    // Strategy: Parse sequentially. Detect Section headers to switch current section.

    let currentSection = "General";

    // We iterate through all elements to preserve order, but simpler is to find Question Tables
    // In SSC HTML, each question seems to be in its own table with a specific style?
    // Let's rely on "Q.No:" text

    // Better strategy for disjointed parts: 
    // Find all 'SPAN' or 'DIV' that indicate section headers.
    // But since we concatenated HTML, we have multiple documents effectively. Check for "lblsubject".

    // Actually, Cheerio loaded the concatenated string, so it's one DOM.
    // But `lblsubject` might appear multiple times.

    // Let's iterate over ALL tables.
    $('table').each((i, table) => {
        const $table = $(table);
        const text = $table.text();

        // Check for Section Header (heuristic)
        if ($table.find('#lblsubject').length > 0) {
            let secText = $table.find('#lblsubject').text().trim();
            // Clean up "PART-A (General ...)" -> "General ..."
            if (secText.includes('(')) {
                currentSection = secText.substring(secText.indexOf('(') + 1, secText.lastIndexOf(')')).trim();
            } else {
                currentSection = secText;
            }
        }

        // Check if Question Table
        if ($table.find('td').first().text().includes('Q.No:')) {
            if (!sections[currentSection]) {
                sections[currentSection] = { correct: 0, wrong: 0, unattempted: 0, total: 0 };
            }
            sections[currentSection].total++;
            totalQuestions++;

            const questionNumber = parseInt($table.find('td:contains("Q.No:")').text().replace(/\D/g, '')) || totalQuestions;

            // Logic for status
            // Correct Option is Green
            // Selected Option might be marked? 
            // SSC:
            // Correct Answer row has `bgcolor='green'` (or yellow in some keys?)
            // Wait, looking at sample:
            // Option 3: bgcolor='green' -> THIS IS CORRECT ANSWER provided by key
            // Candidate selection? 
            // In some SSC keys, candidate response is shown at bottom right? 
            // No, the HTML snippet showed:
            // "Right Option selected" -> Green
            // "Wrong Option selected" -> Red
            // "Correct Option" -> Yellow (if candidate didn't pick it?)
            // "Not Answered" -> Gray

            // Let's use the Legend found validity:
            // <td style="background-color: Green">Correct Option selected</td>
            // <td style="background-color: Red">Wrong Option selected</td>
            // <td style="background-color: Yellow">Correct Option</td>
            // <td style="background-color: Gray">Not Answered</td>

            // So we just check the bgcolor of the TD in the option rows or the last status row.

            let status = 'unknown'; // correct, wrong, unattempted
            let chosenOption = null;
            let correctOption = null;
            let options = [];
            let questionText = `Question ${questionNumber}`;

            // Attempt to extract question text from the first row (Header)
            const headerRow = $table.find('tr').first();
            const headerCells = headerRow.find('td');
            // If extracting from cells: Cell 0 is usually Q.No, Cell 1 is Text
            if (headerCells.length > 1) {
                questionText = $(headerCells[1]).text().trim();
            } else {
                // Fallback: cleanup full row text
                questionText = headerRow.text().replace(/Q\.No:?\s*\d+/i, '').trim();
            }

            // Clean up question text if it's empty
            if (!questionText) questionText = `Question ${questionNumber}`;

            $table.find('tr').each((rowIdx, tr) => {
                const $tr = $(tr);
                const $td = $tr.find('td').first(); // usually 2% width cell
                const color = $td.attr('bgcolor'); // or style background-color

                // Collect Options Text
                // Rows 1-4 are usually options
                if (rowIdx >= 1 && rowIdx <= 4) {
                    const cells = $tr.find('td');
                    let optText = "";
                    if (cells.length > 1) {
                        // Usually the second cell or last cell has the text
                        optText = $(cells[cells.length - 1]).text().trim();
                    } else {
                        optText = $tr.text().trim();
                    }
                    options.push(optText);
                }

                // Scan all cells in row for color/status
                $tr.find('td').each((i, cell) => {
                    const $cell = $(cell);
                    const color = $cell.attr('bgcolor');
                    const style = $cell.attr('style');

                    // Check bgcolor attribute
                    if (color) {
                        const c = color.toLowerCase();
                        if (c === 'green') {
                            status = 'correct'; chosenOption = rowIdx; correctOption = rowIdx;
                        } else if (c === 'red') {
                            status = 'wrong'; chosenOption = rowIdx;
                        } else if (c === 'yellow') {
                            correctOption = rowIdx;
                        } else if (c === 'gray') {
                            status = 'unattempted';
                        } else if (c === 'purple') {
                            status = 'correct';
                        }
                    }

                    // Check inline style
                    if (style && style.toLowerCase().includes('background-color')) {
                        if (style.toLowerCase().includes('green')) {
                            status = 'correct'; chosenOption = rowIdx; correctOption = rowIdx;
                        } else if (style.toLowerCase().includes('red')) {
                            status = 'wrong'; chosenOption = rowIdx;
                        }
                    }
                });
            });

            // Explicit Logic for Metadata:
            const hasGreen = $table.find('td[bgcolor="green"], td[bgcolor="Green"]').length > 0;
            const hasRed = $table.find('td[bgcolor="red"], td[bgcolor="Red"]').length > 0;
            const hasYellow = $table.find('td[bgcolor="yellow"], td[bgcolor="Yellow"]').length > 0;
            const hasPurple = $table.find('td[bgcolor="purple"], td[bgcolor="Purple"]').length > 0;

            if (hasPurple) {
                correct++;
                sections[currentSection].correct++;
            } else if (hasGreen) {
                correct++;
                sections[currentSection].correct++;
            } else if (hasRed) {
                wrong++;
                sections[currentSection].wrong++;

                // Add to wrong questions list with ACUTAL TEXT
                wrongQuestions.push({
                    questionNumber,
                    section: currentSection,
                    questionText: questionText,
                    options: options.length === 4 ? options : ['Option 1', 'Option 2', 'Option 3', 'Option 4'], // Fallback if parsing failed
                    correctAnswer: correctOption || (hasYellow ? 'Check Image' : 'Unknown'),
                    studentAnswer: chosenOption || (hasRed ? 'Check Image' : 'Unknown')
                });
            } else {
                unattempted++;
                sections[currentSection].unattempted++;
            }
        }
    });

    return {
        candidateInfo,
        totalQuestions,
        correct,
        wrong,
        unattempted,
        sections,
        wrongQuestions
    };
}


async function parseStandardDigialm(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Upgrade-Insecure-Requests': '1'
            }
        });
        const html = response.data;
        return parseStandardHtml(html);
    } catch (error) {
        console.error('Parser Error:', error.message);
        throw new Error('Failed to parse URL');
    }
}

function parseStandardHtml(html) {
    try {
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
        const wrongQuestions = []; // NEW: Array to store wrong question details

        // Iterate over each question panel
        $('.question-pnl').each((i, el) => {
            totalQuestions++;
            const questionNumber = totalQuestions;

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

            // 2. Extract Question Text
            let questionText = "";
            const questionDiv = $(el).find('.question-txt, .ques-text, div').first();
            if (questionDiv.length > 0) {
                questionText = questionDiv.text().trim();
                // Remove question number if present
                questionText = questionText.replace(/^Q\.\s*\d+\s*[:\.]\s*/i, '').replace(/^Question\s*\d+\s*[:\.]\s*/i, '');
            }

            // 3. Locate the Option Elements and Extract Text
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

            // Extract options text and find correct answer
            const options = [];
            let correctAnswer = null;
            let isCorrect = false;

            optionRows.forEach((row, idx) => {
                const rowObj = $(row);
                let optionText = rowObj.text().trim();
                // Remove option number
                optionText = optionText.replace(/^[1-4]\.\s*/, '');
                optionText = optionText.replace(/✔/g, '').trim();

                options.push(optionText);

                // Check if this is the correct answer
                const hasTick = rowObj.text().includes('✔');
                const hasCorrectClass = rowObj.find('.correct, .rightAns').length > 0 || rowObj.hasClass('rightAns');
                const hasCorrectImg = rowObj.find('img[alt="Correct"]').length > 0;

                if (hasTick || hasCorrectClass || hasCorrectImg) {
                    correctAnswer = idx + 1; // 1-indexed
                    if (idx + 1 === chosenIndex) {
                        isCorrect = true;
                    }
                }
            });

            if (optionRows.length >= chosenIndex) {
                if (isCorrect) {
                    correct++;
                    sections[sectionName].correct++;
                } else {
                    wrong++;
                    sections[sectionName].wrong++;

                    // Store wrong question details
                    wrongQuestions.push({
                        questionNumber,
                        section: sectionName,
                        questionText: questionText || `Question ${questionNumber}`,
                        options,
                        correctAnswer,
                        studentAnswer: chosenIndex
                    });
                }
            } else {
                wrong++;
                sections[sectionName].wrong++;

                // Store as wrong question
                wrongQuestions.push({
                    questionNumber,
                    section: sectionName,
                    questionText: questionText || `Question ${questionNumber}`,
                    options,
                    correctAnswer,
                    studentAnswer: chosenIndex
                });
            }
        });

        return {
            candidateInfo,
            totalQuestions,
            correct,
            wrong,
            unattempted,
            sections,
            wrongQuestions // NEW: Include wrong questions data
        };

    } catch (error) {
        console.error('Parser Error:', error.message);
        throw new Error('Failed to parse HTML content');
    }
}

module.exports = { parseDigialm };
