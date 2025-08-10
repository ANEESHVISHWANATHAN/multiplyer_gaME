
const express = require("express");
const path = require('path');
const PDFDocument = require("pdfkit");
const cors = require("cors");

const app = express();
const port = 3000;

app.use(cors()); // allow frontend requests
app.use(express.json());

const dirname = process.cwd();

app.get('/',(req, res) =>{
    res.status(200).sendFile(path.join(dirname, "index.html");
});
// Dummy dataset
const resumeData = {
    Name: "John Doe",
    Email: "john@example.com",
    Phone: "+1 234 567 890",
    Skills: "HTML, CSS, JavaScript, Node.js",
    Experience: "2 years as a Full Stack Developer"
};

// Route to generate PDF and send it back
app.get("/generate-pdf", (req, res) => {
    const doc = new PDFDocument();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=resume.pdf");

    doc.fontSize(24).text("Resume", { align: "center" });
    doc.moveDown();

    for (const [key, value] of Object.entries(resumeData)) {
        doc.fontSize(14).text(`${key}: ${value}`);
        doc.moveDown(0.5);
    }

    doc.end();
    doc.pipe(res);
});

app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});