const express = require("express");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(bodyParser.json({ limit: "50mb" }));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

// Register all TTF fonts in the "font" folder
const fontDir = path.join(__dirname, "font");
const fonts = {};
fs.readdirSync(fontDir).forEach(file => {
  if (file.toLowerCase().endsWith(".ttf")) {
    const name = path.basename(file, ".ttf").toLowerCase(); // normalize
    fonts[name] = path.join(fontDir, file);
  }
});

// Map editor font names to font files
const fontMap = {
  "arial": "arial",
  "times new roman": "timesnewroman",
  "courier new": "couriernew",
  "comic sans ms": "comicsansms",
  "trebuchet ms": "trebuchetms",
  "brush script mt": "brushscriptmt",
  "copperplate": "copperplate",
  "helvetica": "helvetica",
  "impact": "impact",
  "palatino": "palatino",
  "tahoma": "tahoma",
  "verdana": "verdana",
  "georgia": "georgia",
  "garamond": "garamond",
  "papyrus": "papyrus"
};

// Utility to convert percentage to absolute points
function pct(value, total) {
  if (typeof value !== "string") return 0;
  return parseFloat(value) / 100 * total;
}

app.post("/makepdf", async (req, res) => {
  try {
    const { elements, width, height } = req.body;

    // fallback to A4 if width/height not provided
    const doc = new PDFDocument({
      size: width && height ? [width, height] : "A4",
      margin: 0
    });

    // Register fonts in PDFKit
    for (const f in fonts) {
      doc.registerFont(f, fonts[f]);
    }

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

        // inside your label rendering block
doc.fontSize(size);

// normalize font name from client
const clientFont = (el.fontFamily || "").toLowerCase();
const mappedFont = fontMap[clientFont];

// pick font variant
let fontKey = mappedFont;

if (mappedFont) {
  if (el.fontWeight === "bold" && fonts[mappedFont + "bd"]) {
    fontKey = mappedFont + "bd"; // ex: arialbd.ttf → registered as "arialbd"
  } else if (el.fontStyle === "italic" && fonts[mappedFont + "i"]) {
    fontKey = mappedFont + "i"; // ex: ariali.ttf → registered as "ariali"
  }
}

// apply font if found
if (fontKey && fonts[fontKey]) {
  doc.font(fontKey);
} else {
  doc.font("Helvetica"); // fallback
}
        // apply color
        doc.fillColor(el.color || "#000");

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
          const base64 = el.src.split(",")[1];
          const imgData = Buffer.from(base64, "base64");
          doc.image(imgData, x, y, { width: w, height: h });
        } else {
          console.log("Image source is not Base64:", el.src);
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
    console.error("PDF generation failed:", err);
    res.status(500).send("PDF generation failed");
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});