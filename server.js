const express = require("express");  
const bodyParser = require("body-parser");  
const PDFDocument = require("pdfkit");  
const path = require("path");  const app = express();
app.use(bodyParser.json({ limit: "50mb" }));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

// Utility to convert percentage to absolute points
function pct(value, total) {
if (typeof value !== 'string') return 0;
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
    const size = parseInt(el.fontSize) || 12;  

    doc.fontSize(size);  

    // Use a default font like Helvetica  
    doc.font('Helvetica');  

    doc.fillColor(el.color || "#000");  

    // Options for text (e.g., underline)  
    const opts = {  
      underline: el.textDecoration === "underline"  
    };  

    doc.text(el.text, x, y, opts);  

  } else if (el.type === "img") {  
    const x = pct(el.left, pageW);  
    const y = pct(el.top, pageH);  
    const w = pct(el.width, pageW);  
    const h = pct(el.height, pageH);  

    if (el.src.startsWith("data:image")) {  
      // Extract Base64 data and create a buffer  
      const base64 = el.src.split(",")[1];  
      const imgData = Buffer.from(base64, "base64");  
      doc.image(imgData, x, y, { width: w, height: h });  
    } else {  
      console.log("Image source is not Base64:", el.src);  
    }  

    // Check if there's a border and draw it  
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
console.error("PDF generation failed:", err);
res.status(500).send("PDF generation failed");
}
});

app.listen(3000, () => {
console.log("Server running at http://localhost:3000");
});