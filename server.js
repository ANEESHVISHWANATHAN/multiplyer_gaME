 const express = require("express");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const fetch = require("node-fetch"); // to fetch blob URLs if needed
const fs = require("fs");

const app = express();
app.use(bodyParser.json({ limit: "50mb" }));
app.get("/", (req, res) => res.sendFile(__dirname + "/index.html"));
// Utility: % -> absolute
function pct(value, total) {
  if (!value) return 0;
  return parseFloat(value) / 100 * total;
}

app.post("/makepdf", async (req, res) => {
  try {
    const elements = req.body;
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    let buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=output.pdf");
      res.send(pdfData);
    });

    const pageW = doc.page.width;
    const pageH = doc.page.height;

    for (let el of elements) {
      if (el.type === "label") {
        const x = pct(el.left, pageW);
        const y = pct(el.top, pageH);

        let size = parseInt(el.fontSize) || 12;
        doc.fontSize(size);

        // font family mapping
        try {
          doc.font(el.fontFamily.includes("Courier") ? "Courier" : "Helvetica");
        } catch {
          doc.font("Helvetica");
        }

        // style
        const opts = { underline: el.textDecoration === "underline" };
        doc.fillColor(el.color || "#000");

        // bold / italic simulation
        let text = el.text;
        if (el.fontWeight === "bold") text = text; // PDFKit doesn't directly bold, would need font file
        if (el.fontStyle === "italic") text = text;

        doc.text(text, x, y, opts);

      } else if (el.type === "img") {
        const x = pct(el.left, pageW);
        const y = pct(el.top, pageH);
        const w = pct(el.width, pageW);
        const h = pct(el.height, pageH);

        let imgData = null;
        if (el.src.startsWith("data:image")) {
          // base64
          const base64 = el.src.split(",")[1];
          imgData = Buffer.from(base64, "base64");
        } else if (el.src.startsWith("http")) {
          const r = await fetch(el.src);
          imgData = Buffer.from(await r.arrayBuffer());
        }

        if (imgData) {
          doc.image(imgData, x, y, { width: w, height: h });
        }

        if (el.border) {
          doc.rect(x, y, w, h)
            .lineWidth(2)
            .strokeColor(el.borderColor || "#000")
            .stroke();
        }
      }
    }

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("PDF generation failed");
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});