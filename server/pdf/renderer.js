// Fills Passport_Blank.pdf with student data using pdf-lib. Template and stamp bytes are cached.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { STAMP_CODE_BY_CATEGORY } from '../shared/constants.js';
import { formatDate } from '../shared/format.js';
import { wrapText } from './textWrap.js';
import { BACKDROP_COLOR, PAGE_1, PAGE_3, PAGE_4, PASSPORT_ID_FOOTER, TEXT_COLOR } from './layout.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(currentDir, 'assets/template/Passport_Blank.pdf');
const STAMPS_DIR = path.join(currentDir, 'assets/stamps');
const EARNED_THROUGH_PLACEHOLDER = '—';
// Fraction of font size used to center text vertically on a baseline
const HALF_CAP_HEIGHT = 0.35;

let cachedTemplateBytes = null;
const cachedStampBytes = new Map(); // stamp code -> PNG bytes

async function loadTemplateBytes() {
  if (!cachedTemplateBytes) {
    cachedTemplateBytes = await readFile(TEMPLATE_PATH);
  }
  return cachedTemplateBytes;
}

async function loadStampBytes(stampCode) {
  if (!cachedStampBytes.has(stampCode)) {
    cachedStampBytes.set(stampCode, await readFile(path.join(STAMPS_DIR, `${stampCode}.png`)));
  }
  return cachedStampBytes.get(stampCode);
}

// student: { firstName, lastName, passportId, firstIssued }
// awards: rows from the reader (skillName, skillCategory, skillDescription, dateEarned, recordId)
export async function renderPassportPdf(student, awards) {
  const doc = await PDFDocument.load(await loadTemplateBytes());
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const sortedAwards = sortAwardsOldestFirst(awards);
  const stamps = await embedStamps(doc, sortedAwards);
  const pages = doc.getPages();

  drawPage1(pages[0], student, fonts);
  drawPage3(pages[2], sortedAwards, fonts, stamps);
  drawPage4(pages[3], sortedAwards, fonts, stamps);
  pages.forEach((page, index) => drawPassportIdFooter(page, index, student.passportId, fonts));

  return doc.save();
}

// Oldest first, so a newly earned skill is always added at the end
function sortAwardsOldestFirst(awards) {
  return [...awards].sort((a, b) => {
    if (a.dateEarned !== b.dateEarned) {
      return a.dateEarned < b.dateEarned ? -1 : 1;
    }
    return a.recordId < b.recordId ? -1 : 1;
  });
}

// Embeds each needed stamp image once per document. Returns category -> embedded image.
async function embedStamps(doc, awards) {
  const stamps = new Map();
  for (const award of awards) {
    if (stamps.has(award.skillCategory)) continue;

    const stampCode = STAMP_CODE_BY_CATEGORY[award.skillCategory];
    stamps.set(award.skillCategory, await doc.embedPng(await loadStampBytes(stampCode)));
  }
  return stamps;
}

function drawPage1(page, student, fonts) {
  drawText(page, student.firstName, fonts.regular, PAGE_1.name);
  drawText(page, student.lastName, fonts.regular, PAGE_1.surname);
  drawText(page, formatDate(student.firstIssued), fonts.regular, PAGE_1.date);
}

function drawPassportIdFooter(page, pageIndex, passportId, fonts) {
  const footer = PASSPORT_ID_FOOTER[pageIndex];
  const width = fonts.regular.widthOfTextAtSize(passportId, footer.size);
  const x = footer.align === 'right' ? footer.x - width : footer.x;
  drawText(page, passportId, fonts.regular, { x, y: footer.y, size: footer.size });
}

function drawPage3(page, awards, fonts, stamps) {
  warnIfTooMany(awards.length, PAGE_3.maxCards, 'page 3');

  awards.slice(0, PAGE_3.maxCards).forEach((award, index) => {
    const card = PAGE_3.cards[index];

    drawCenteredLine(page, formatDate(award.dateEarned), fonts.regular, PAGE_3.date.size, card.centerX, card.top - PAGE_3.date.offset);
    drawBackdrop(page, card.centerX, card.top - PAGE_3.backdrop.centerOffset, PAGE_3.backdrop);
    drawStamp(page, stamps.get(award.skillCategory), card.centerX, card.top - PAGE_3.stamp.centerOffset, PAGE_3.stamp.width);

    const nameLines = wrapText(award.skillName.toUpperCase(), fonts.bold, PAGE_3.skillName.size, PAGE_3.skillName.maxWidth)
      .slice(0, PAGE_3.skillName.maxLines);
    let baseline = card.top - PAGE_3.skillName.firstBaselineOffset;
    for (const line of nameLines) {
      drawCenteredLine(page, line, fonts.bold, PAGE_3.skillName.size, card.centerX, baseline);
      baseline -= PAGE_3.skillName.lineHeight;
    }

    // baseline already moved one line past the last name line
    const categoryBaseline = baseline + PAGE_3.skillName.lineHeight - PAGE_3.category.gapBelowName;
    drawCenteredLine(page, award.skillCategory.toUpperCase(), fonts.regular, PAGE_3.category.size, card.centerX, categoryBaseline);
  });
}

function drawPage4(page, awards, fonts, stamps) {
  warnIfTooMany(awards.length, PAGE_4.maxRows, 'page 4');

  awards.slice(0, PAGE_4.maxRows).forEach((award, index) => {
    const centerY = PAGE_4.rowCenters[index];

    drawStamp(page, stamps.get(award.skillCategory), PAGE_4.stamp.centerX, centerY, PAGE_4.stamp.width);
    drawWrappedCentered(page, award.skillName.toUpperCase(), fonts.bold, PAGE_4.skill, centerY);
    drawWrappedCentered(page, award.skillDescription.toUpperCase(), fonts.regular, PAGE_4.description, centerY);
    drawWrappedCentered(page, EARNED_THROUGH_PLACEHOLDER, fonts.regular, PAGE_4.earnedThrough, centerY);
    drawCenteredLine(
      page,
      formatDate(award.dateEarned),
      fonts.regular,
      PAGE_4.dateEarned.size,
      PAGE_4.dateEarned.centerX,
      centerY - PAGE_4.dateEarned.size * HALF_CAP_HEIGHT,
    );
  });
}

// Height follows the image aspect ratio, so the stamp is never stretched
function drawStamp(page, image, centerX, centerY, width) {
  const height = (width * image.height) / image.width;
  page.drawImage(image, { x: centerX - width / 2, y: centerY - height / 2, width, height });
}

// White block that hides the template's decorative asterisk under the stamp
function drawBackdrop(page, centerX, centerY, size) {
  page.drawRectangle({
    x: centerX - size.width / 2,
    y: centerY - size.height / 2,
    width: size.width,
    height: size.height,
    color: toPdfColor(BACKDROP_COLOR),
  });
}

function drawText(page, text, font, { x, y, size }) {
  page.drawText(text, { x, y, size, font, color: toPdfColor(TEXT_COLOR) });
}

function drawCenteredLine(page, text, font, size, centerX, baselineY) {
  const width = font.widthOfTextAtSize(text, size);
  drawText(page, text, font, { x: centerX - width / 2, y: baselineY, size });
}

// Wraps text to the column width and centers the whole block vertically on centerY
function drawWrappedCentered(page, text, font, column, centerY) {
  const lines = wrapText(text, font, column.size, column.maxWidth);
  const blockHeight = (lines.length - 1) * column.lineHeight;
  let baseline = centerY + blockHeight / 2 - column.size * HALF_CAP_HEIGHT;

  for (const line of lines) {
    drawCenteredLine(page, line, font, column.size, column.centerX, baseline);
    baseline -= column.lineHeight;
  }
}

function toPdfColor({ r, g, b }) {
  return rgb(r / 255, g / 255, b / 255);
}

// Page duplication is not implemented yet, so extra skills are skipped
function warnIfTooMany(count, max, pageName) {
  if (count > max) {
    console.warn(`Warning: ${count} skills but ${pageName} fits ${max}; the rest are not drawn yet.`);
  }
}
