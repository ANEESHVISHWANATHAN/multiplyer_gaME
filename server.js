const express = require("express");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");

const app = express();
app.use(express.static(__dirname));
app.use(bodyParser.json({ limit: "10mb" })); // allow big base64 images

// serve html
app.get("/", (req, res) => res.sendFile(__dirname + "/index.html"));

// pdf route
app.post("/makepdf", (req, res) => {
  const { image } = req.body;
  if (!image) return res.status(400).send("No image data");

  const doc = new PDFDocument({ size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=editor.pdf");
  doc.pipe(res);

  const img = image.replace(/^data:image\/png;base64,/, "");
  const buf = Buffer.from(img, "base64");

  // place snapshot on page
  doc.image(buf, 40, 40, { fit: [500, 700], align: "center", valign: "center" });

  doc.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));