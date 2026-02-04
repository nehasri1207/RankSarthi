const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function generateWrongQuestionsPDF(wrongQuestions, candidateInfo, examName) {
    return new Promise((resolve, reject) => {
        try {
            // Create PDF document
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 50, bottom: 50, left: 50, right: 50 }
            });

            // Create temporary file path
            const tempDir = path.join(__dirname, '../temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const filename = `wrong-questions-${Date.now()}.pdf`;
            const filepath = path.join(tempDir, filename);
            const stream = fs.createWriteStream(filepath);

            doc.pipe(stream);

            // Header
            doc.fontSize(20).fillColor('#3D5A80').text('Know Your Wrong Questions', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(14).fillColor('#293241').text(examName, { align: 'center' });
            doc.moveDown(1);

            // Candidate Info
            if (candidateInfo && candidateInfo.name && candidateInfo.rollNo) {
                doc.fontSize(11).fillColor('#666666');
                doc.text(`Name: ${candidateInfo.name}`, { continued: true });
                doc.text(`     Roll No: ${candidateInfo.rollNo}`, { align: 'right' });
                doc.moveDown(0.3);
                if (candidateInfo.date && candidateInfo.time) {
                    doc.text(`Date: ${candidateInfo.date}`, { continued: true });
                    doc.text(`     Time: ${candidateInfo.time}`, { align: 'right' });
                }
            }

            doc.moveDown(1);
            doc.strokeColor('#E0E0E0').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
            doc.moveDown(1);

            // Summary
            doc.fontSize(12).fillColor('#293241').text(`Total Wrong Questions: ${wrongQuestions.length}`, { bold: true });
            doc.moveDown(1.5);

            // Group questions by section
            const questionsBySection = {};
            wrongQuestions.forEach(q => {
                if (!questionsBySection[q.section]) {
                    questionsBySection[q.section] = [];
                }
                questionsBySection[q.section].push(q);
            });

            // Print questions section-wise
            let questionCounter = 1;
            Object.keys(questionsBySection).forEach((section, sectionIndex) => {
                // Section header
                doc.fontSize(14).fillColor('#3D5A80').text(section, { underline: true });
                doc.moveDown(0.8);

                questionsBySection[section].forEach((question, qIndex) => {
                    const startY = doc.y;

                    // Check if we need a new page
                    if (startY > 650) {
                        doc.addPage();
                    }

                    // Question number and text
                    doc.fontSize(11).fillColor('#293241').font('Helvetica-Bold');
                    doc.text(`Question ${questionCounter}:`, { continued: false });
                    doc.font('Helvetica').moveDown(0.3);

                    if (question.questionText && question.questionText.length > 0) {
                        // Removed truncation limit (was 500) to show full question
                        doc.fontSize(10).fillColor('#000000').text(question.questionText, { align: 'justify' });
                    }

                    doc.moveDown(0.5);

                    // Options
                    if (question.options && question.options.length > 0) {
                        question.options.forEach((option, idx) => {
                            const optionNum = idx + 1;
                            const isCorrect = optionNum === question.correctAnswer;
                            // const isStudentChoice = optionNum === question.studentAnswer; // Not needed for styling per request

                            doc.fontSize(10);

                            if (isCorrect) {
                                // Correct answer - Highlight Green
                                doc.fillColor('#28A745').font('Helvetica-Bold');
                            } else {
                                // All other options (including student's wrong choice) - Regular Grey
                                doc.fillColor('#666666').font('Helvetica');
                            }

                            let prefix = '';
                            if (isCorrect) prefix = '✓ ';
                            // Removed X prefix for wrong choice

                            // Render option text
                            doc.text(`${prefix}${optionNum}. ${option}`);
                            doc.moveDown(0.3);
                        });
                    }

                    // Answer summary
                    doc.fontSize(9).fillColor('#666666').font('Helvetica-Oblique');
                    // Mention chosen option explicitly here
                    doc.text(`Your Answer: Option ${question.studentAnswer}     Correct Answer: Option ${question.correctAnswer || 'N/A'}`, { align: 'left' });

                    doc.moveDown(1);
                    // Separator line
                    doc.strokeColor('#E0E0E0').lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
                    doc.moveDown(1);

                    questionCounter++;
                });

                doc.moveDown(0.5);
            });

            // Footer on last page
            doc.fontSize(8).fillColor('#999999').text('Generated by RankSaarthi', { align: 'center' });

            doc.end();

            stream.on('finish', () => {
                resolve({ filepath, filename });
            });

            stream.on('error', (error) => {
                reject(error);
            });

        } catch (error) {
            reject(error);
        }
    });
}

module.exports = { generateWrongQuestionsPDF };
