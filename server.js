const express = require("express");
const path = require("path");
const PDFDocument = require("pdfkit");
const cors = require("cors");

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const dirname = process.cwd();

console.log("📂 Project root directory:", dirname);

app.get("/", (req, res) => {
    console.log("📥 [GET /] Serving index.html");
    const filePath = path.join(dirname, "index.html");
    console.log("📄 File path:", filePath);
    res.status(200).sendFile(filePath, (err) => {
        if (err) {
            console.error("❌ Error sending index.html:", err);
            res.status(500).send("Failed to load index.html");
        } else {
            console.log("✅ index.html served successfully");
        }
    });
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
    console.log("📥 [GET /generate-pdf] Request received");

    try {
        const doc = new PDFDocument();

        // Log headers being sent
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline; filename=resume.pdf");
        console.log("📄 PDF headers set");

        // Write PDF content
        console.log("🖨 Writing PDF content...");
        doc.fontSize(24).text("Resume", { align: "center" });
        doc.moveDown();

        for (const [key, value] of Object.entries(resumeData)) {
            console.log(`✏ Adding: ${key} = ${value}`);
            doc.fontSize(14).text(`${key}: ${value}`);
            doc.moveDown(0.5);
        }

        // Finalize and send
        doc.pipe(res);
        doc.end();
        console.log("✅ PDF generated and sent to client");

    } catch (err) {
        console.error("❌ Error generating PDF:", err);
        res.status(500).send("Failed to generate PDF");
    }
});

app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});