// Demo helper (scenario 10): changes the first name in an official passport PDF so verification must fail.
// The fake looks identical to the original (same font, size, color, position as the renderer),
// so the eye cannot tell them apart, but the SHA-256 differs and the blockchain check shows it.
// Usage: npm run tamper -- <input.pdf> [output.pdf]
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { BACKDROP_COLOR, PAGE_1, TEXT_COLOR } from '../pdf/layout.js';

const FAKE_NAME = 'Nika';

// The white block must cover the old name but stop before the DATE value on the same line.
const COVER_WIDTH = 330;
const COVER_PADDING_BELOW = 6; // room for letter tails (g, y, p)
const COVER_HEIGHT = PAGE_1.name.size + COVER_PADDING_BELOW + 3;

function fail(message) {
  console.error(`შეცდომა: ${message}`);
  process.exit(1);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function toPdfColor({ r, g, b }) {
  return rgb(r / 255, g / 255, b / 255);
}

function parseArguments() {
  const [inputPath, outputArgument] = process.argv.slice(2);
  if (!inputPath) {
    fail('ფაილი არ არის მითითებული.\nგამოყენება: npm run tamper -- <input.pdf> [output.pdf]');
  }
  const parsed = path.parse(inputPath);
  const defaultOutput = path.join(parsed.dir, `${parsed.name}-tampered.pdf`);
  const outputPath = outputArgument ?? defaultOutput;

  // Never overwrite the original: the demo needs both files.
  if (path.resolve(outputPath) === path.resolve(inputPath)) {
    fail('output ფაილი ემთხვევა input-ს. ორიგინალი არ გადაიწერება, მიუთითეთ სხვა სახელი.');
  }
  return { inputPath, outputPath };
}

async function readPdfBytes(inputPath) {
  if (!existsSync(inputPath)) {
    fail(`ფაილი ვერ მოიძებნა: ${inputPath}`);
  }
  const bytes = await readFile(inputPath);
  // Every PDF starts with "%PDF-"
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    fail(`ეს ფაილი არ არის PDF: ${inputPath}`);
  }
  return bytes;
}

async function replaceNameOnFirstPage(originalBytes) {
  let doc;
  try {
    doc = await PDFDocument.load(originalBytes);
  } catch {
    fail('PDF-ის გახსნა ვერ მოხერხდა, ფაილი დაზიანებულია.');
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.getPage(0);
  const { x, y, size } = PAGE_1.name;

  page.drawRectangle({
    x: x - 2,
    y: y - COVER_PADDING_BELOW,
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
    color: toPdfColor(BACKDROP_COLOR),
  });
  page.drawText(FAKE_NAME, { x, y, size, font, color: toPdfColor(TEXT_COLOR) });
  return doc.save();
}

async function main() {
  const { inputPath, outputPath } = parseArguments();
  const originalBytes = await readPdfBytes(inputPath);
  const tamperedBytes = await replaceNameOnFirstPage(originalBytes);
  await writeFile(outputPath, tamperedBytes);

  const originalHash = sha256(originalBytes);
  const tamperedHash = sha256(tamperedBytes);
  console.log(`ორიგინალი (უცვლელია): ${inputPath}`);
  console.log(`ყალბი ფაილი:          ${outputPath}`);
  console.log(`სახელი შეიცვალა:      → ${FAKE_NAME}`);
  console.log(`ორიგინალის SHA-256:   ${originalHash}`);
  console.log(`ახლის SHA-256:        ${tamperedHash}`);
  console.log(
    originalHash === tamperedHash
      ? 'ყურადღება: ჰეშები ერთნაირია, გაყალბება არ მოხდა.'
      : 'ჰეშები განსხვავდება → verify აჩვენებს ❌',
  );
}

main();
