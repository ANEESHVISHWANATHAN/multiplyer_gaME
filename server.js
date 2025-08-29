const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const puppeteer = require("puppeteer");

const app = express();
app.use(bodyParser.json({ limit: "50mb" }));

app.get("/", (req, res) => {
  console.log("[GET] / - Sending index.html");
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/makepdf", async (req, res) => {
  console.log("[POST] /makepdf - Request received");
  try {
    const { elements, width, height } = req.body;
    console.log("[INFO] Elements received:", elements.length);

    const pageWidth = width || 595;   // A4 width in pt
    const pageHeight = height || 842; // A4 height in pt
    console.log(`[INFO] Page size set to ${pageWidth} x ${pageHeight}`);

    // Build HTML dynamically
    let html = `
      <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            width: ${pageWidth}px;
            height: ${pageHeight}px;
            position: relative;
          }
          .el {
            position: absolute;
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
    `;

    for (let el of elements) {
      if (el.type === "label") {
        html += `<div class="el" 
                    style="
                      left:${el.left};
                      top:${el.top};
                      font-size:${el.fontSize || 12}px;
                      font-family:'${el.fontFamily || "Arial"}';
                      font-weight:${el.fontWeight || "normal"};
                      font-style:${el.fontStyle || "normal"};
                      color:${el.color || "#000"};
                      text-decoration:${el.textDecoration || "none"};
                    ">
                    ${el.text}
                 </div>`;
      } else if (el.type === "img") {
        html += `<img class="el"
                    src="${el.src}"
                    style="
                      left:${el.left};
                      top:${el.top};
                      width:${el.width};
                      height:${el.height};
                      border:${el.border ? `2px solid ${el.borderColor || "#000"}` : "none"};
                    " />`;
      }
    }

    html += `</body></html>`;
    console.log("[INFO] HTML content built");

    // Launch Puppeteer
    console.log("[INFO] Launching Puppeteer...");
    const browser = await puppeteer.launch({
      headless: true,
      
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    console.log("[INFO] Puppeteer launched");

    const page = await browser.newPage();
    console.log("[INFO] New page created");

    await page.setContent(html, { waitUntil: "networkidle0" });
    console.log("[INFO] Page content set, ready for PDF");

    const pdfBuffer = await page.pdf({
      printBackground: true,
      width: `${pageWidth}px`,
      height: `${pageHeight}px`
    });
    console.log("[INFO] PDF generated");

    await browser.close();
    console.log("[INFO] Puppeteer browser closed");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=output.pdf");
    res.send(pdfBuffer);
    console.log("[INFO] PDF sent to client");

  } catch (err) {
    console.error("[ERROR] Puppeteer PDF generation failed:", err);
    res.status(500).send("PDF generation failed");
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});