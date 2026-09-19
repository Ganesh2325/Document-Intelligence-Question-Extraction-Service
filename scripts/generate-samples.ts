import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";

const root = path.join(process.cwd(), "samples");

async function textPdf(file: string, title: string, pages: string[][]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  for (const lines of pages) {
    const page = doc.addPage([612, 792]);
    page.drawText(title, { x: 56, y: 740, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
    let y = 700;
    for (const line of lines) {
      page.drawText(line, { x: 56, y, size: 12, font, color: rgb(0.1, 0.12, 0.12) });
      y -= 18;
    }
  }
  await writeFile(file, await doc.save());
}

async function imageOnlyPdf(file: string, png: Buffer) {
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(png);
  const page = doc.addPage([612, 792]);
  page.drawImage(image, { x: 36, y: 80, width: 540, height: 680 });
  await writeFile(file, await doc.save());
}

function svgFor(lines: string[], blur = 0, fill = "#111"): string {
  const text = lines
    .map((line, i) => `<text x="40" y="${80 + i * 36}" font-size="28" font-family="Times New Roman, serif" fill="${fill}">${escapeXml(line)}</text>`)
    .join("");
  const filter = blur ? `<filter id="b"><feGaussianBlur stdDeviation="${blur}"/></filter>` : "";
  const group = blur ? `<g filter="url(#b)">${text}</g>` : text;
  return `<svg width="1200" height="1600" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f4f1ea"/>${filter}${group}</svg>`;
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function main() {
  await mkdir(root, { recursive: true });

  await textPdf(path.join(root, "01-clean-digital.pdf"), "National Science Paper — Clean Digital", [
    [
      "Time: 1 hour    Maximum Marks: 40",
      "",
      "1. Which of the following is a vector quantity?",
      "A. Mass",
      "B. Speed",
      "C. Velocity",
      "D. Time",
      "",
      "2. The SI unit of force is the",
      "A. Joule",
      "B. Newton",
      "C. Pascal",
      "D. Watt",
      "",
      "3. True or false: Water boils at 100C at 1 atm.",
      "(a) True",
      "(b) False",
      "",
      "4. Explain why the sky appears blue.",
      "",
      "5. Fill in the blank: The chemical symbol for gold is _____.",
    ],
  ]);

  const scanPng = await sharp(Buffer.from(svgFor([
    "Scanned Science Paper",
    "1. Which planet is nearest to the Sun?",
    "A. Mercury",
    "B. Venus",
    "C. Earth",
    "D. Mars",
    "2. Define photosynthesis.",
  ])))
    .png()
    .toBuffer();
  await imageOnlyPdf(path.join(root, "02-scanned.pdf"), scanPng);

  const lowPng = await sharp(Buffer.from(svgFor([
    "Low quality scan",
    "1. Which gas is used in bulbs?",
    "A. Oxygen",
    "B. Argon",
    "C. Nitrogen",
    "D. Hydrogen",
  ], 1.4, "#555")))
    .jpeg({ quality: 28 })
    .toBuffer();
  const lowPdfPng = await sharp(lowPng).png().toBuffer();
  await imageOnlyPdf(path.join(root, "03-low-quality-scan.pdf"), lowPdfPng);

  await textPdf(path.join(root, "04-multipage-question.pdf"), "Multi-page reconstruction paper", [
    [
      "Question 14. Which of the following is a noble gas?",
      "A. Oxygen",
      "B. Nitrogen",
    ],
    [
      "C. Helium",
      "D. Chlorine",
      "",
      "Question 15. Define isotope.",
      "",
      "Question 16. Which of the following are metals? Select all that apply.",
      "A. Iron",
      "B. Sulphur",
      "C. Copper",
      "D. Phosphorus",
    ],
  ]);

  await textPdf(path.join(root, "05-question-paper.pdf"), "Exam Set A — Question Paper", [
    [
      "1. Which organ pumps blood?",
      "A. Liver",
      "B. Heart",
      "C. Lung",
      "D. Kidney",
      "",
      "2. Q2. The process of cell division is called",
      "A. Osmosis",
      "B. Mitosis",
      "C. Diffusion",
      "D. Fusion",
      "",
      "(3) Which vitamin is produced in skin sunlight?",
      "A. Vitamin A",
      "B. Vitamin B",
      "C. Vitamin C",
      "D. Vitamin D",
    ],
  ]);

  await textPdf(path.join(root, "05-answer-key.pdf"), "Exam Set A — Answer Key", [
    ["Answer Key", "1-B", "Q2: B", "3. (D)"],
  ]);

  const imageQuestion = await sharp(Buffer.from(svgFor([
    "Image question paper (PNG)",
    "Question No. 1 Identify the instrument.",
    "A. Voltmeter",
    "B. Ammeter",
    "C. Galvanometer",
    "D. Barometer",
    "2) Briefly state Ohm's law.",
  ])))
    .png()
    .toBuffer();
  await writeFile(path.join(root, "06-image-question.png"), imageQuestion);

  await writeFile(
    path.join(root, "07-unsupported.txt"),
    "This is an unsupported file used to demonstrate upload rejection.\n",
  );

  await textPdf(path.join(root, "08-ambiguous-answer-key.pdf"), "Ambiguous key demonstration", [
    [
      "1. Which of the following is an alkali metal?",
      "A. Iron",
      "B. Sodium",
      "C. Copper",
      "D. Zinc",
      "",
      "Answer Key",
      "1-B",
      "1-C",
    ],
  ]);

  await writeFile(
    path.join(root, "README.md"),
    `# Sample documents

These fixtures are generated by \`npm run samples\`.

| File | What it demonstrates |
| --- | --- |
| 01-clean-digital.pdf | Digitally generated PDF with mixed numbering and types |
| 02-scanned.pdf | Image-only PDF that must go through OCR |
| 03-low-quality-scan.pdf | Poor scan expected to produce review items |
| 04-multipage-question.pdf | Question 14 continues from page 1 onto page 2 |
| 05-question-paper.pdf + 05-answer-key.pdf | Related documents / separate answer key |
| 06-image-question.png | PNG question paper |
| 07-unsupported.txt | Rejected upload |
| 08-ambiguous-answer-key.pdf | Conflicting answers remain UNCERTAIN |

Structured example output for these fixtures is in \`samples/extracted/\`.
`,
  );

  console.log("Wrote sample documents to samples/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
