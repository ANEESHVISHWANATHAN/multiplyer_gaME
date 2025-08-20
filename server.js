        const express = require("express");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const fetch = require("node-fetch");

const app = express();
app.use(bodyParser.json({ limit: "50mb" }));

// ---------- Font Map ----------
const fontMap = {
  Arial: {
    normal: "fonts/Arial.ttf",
    bold: "fonts/Arial-Bold.ttf",
    italic: "fonts/Arial-Italic.ttf",
    bolditalic: "fonts/Arial-BoldItalic.ttf",
  },
  Times: {
    normal: "fonts/Times.ttf",
    bold: "fonts/Times-Bold.ttf",
    italic: "fonts/Times-Italic.ttf",
    bolditalic: "fonts/Times-BoldItalic.ttf",
  },
  Verdana: {
    normal: "fonts/Verdana.ttf",
    bold: "fonts/Verdana-Bold.ttf",
    italic: "fonts/Verdana-Italic.ttf",
    bolditalic: "fonts/Verdana-BoldItalic.ttf",
  },
  Default: {
    normal: "fonts/Arial.ttf",
    bold: "fonts/Arial-Bold.ttf",
    italic: "fonts/Arial-Italic.ttf",
    bolditalic: "fonts/Arial-BoldItalic.ttf",
  },
};

// ---------- Helper ----------
function pct(value, total) {
  if (!value) return 0;
  return parseFloat(value) / 100 * total;
}

function pickFont(fontFamily, weight, style) {
  let base = "Default";
  if (fontFamily) {
    if (/arial/i.test(fontFamily)) base = "Arial";
    else if (/times/i.test(fontFamily)) base = "Times";
    else if (/verdana/i.test(fontFamily)) base = "Verdana";
  }
  const isBold = weight === "bold";
  const isItalic = style === "italic";
  if (isBold && isItalic) return fontMap[base].bolditalic;
  if (isBold) return fontMap[base].bold;
  if (isItalic) return fontMap[base].italic;
  return fontMap[base].normal;
}

// ---------- Route ----------
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
        const size = parseInt(el.fontSize) || 14;

        const fontPath = pickFont(el.fontFamily, el.fontWeight, el.fontStyle);
        doc.font(fontPath).fontSize(size).fillColor(el.color || "#000");

        doc.text(el.text, x, y, {
          underline: el.textDecoration === "underline",
        });

      } else if (el.type === "img") {
        const x = pct(el.left, pageW);
        const y = pct(el.top, pageH);
        const w = pct(el.width, pageW);
        const h = pct(el.height, pageH);

        let imgData = null;
        if (el.src.startsWith("data:image")) {
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
