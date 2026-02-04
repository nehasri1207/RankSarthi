const { generateWrongQuestionsPDF } = require('./services/pdfGenerator');
const fs = require('fs');

const mockWrongQuestions = [
    {
        questionNumber: 1,
        section: 'General Intelligence',
        questionText: 'What is the capital of France?',
        options: ['London', 'Berlin', 'Paris', 'Madrid'],
        correctAnswer: 3,
        studentAnswer: 1
    },
    {
        questionNumber: 5,
        section: 'General Intelligence',
        questionText: 'Which number completes the series: 2, 4, 8, 16, ...?',
        options: ['24', '32', '30', '28'],
        correctAnswer: 2,
        studentAnswer: 4
    }
];

const mockCandidateInfo = {
    name: 'Test Candidate',
    rollNo: '1234567890',
    date: '02/02/2025',
    time: '9:00 AM - 12:00 PM'
};

async function test() {
    try {
        console.log('Generating PDF...');
        const result = await generateWrongQuestionsPDF(mockWrongQuestions, mockCandidateInfo, 'Sample Exam 2025');
        console.log('PDF Generated at:', result.filepath);
        if (fs.existsSync(result.filepath)) {
            console.log('SUCCESS: File exists.');
        } else {
            console.error('FAILURE: File not found.');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
