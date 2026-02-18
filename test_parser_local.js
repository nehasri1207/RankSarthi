const { parseDigialm } = require('./services/parser');

async function test() {
    console.log("Testing Standard Parser with Invalid URL...");
    try {
        await parseDigialm("https://cdn.digialm.com/wrong/url");
    } catch (e) {
        console.log("Caught expected error for Standard parser:", e.message);
    }

    console.log("\nTesting SSC Parser with Invalid URL...");
    try {
        await parseDigialm("https://sscexam.cbexams.com/wrong/url");
    } catch (e) {
        console.log("Caught expected error for SSC parser:", e.message);
    }
}

test();
