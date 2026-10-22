// Fills Passport_Blank.pdf with student data using pdf-lib. Template and stamp bytes are cached.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { STAMP_CODE_BY_CATEGORY } from '../shared/constants.js';
import { formatDate } from '../shared/format.js';
import { fitTextToCell, wrapText } from './textWrap.js';
import { BACKDROP_COLOR, PAGE_1, PAGE_3, PAGE_4, PASSPORT_ID_FOOTER, TEXT_COLOR } from './layout.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(currentDir, 'assets/template/Passport_Blank.pdf');
const STAMPS_DIR = path.join(currentDir, 'assets/stamps');
// Index of each page in Passport_Blank.pdf
const TEMPLATE_PAGE = { COVER: 0, INFO: 1, STAMP_CARDS: 2, TABLE: 3 };
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
// verificationCode: created by the issuance pipeline, the renderer only draws it
export async function renderPassportPdf(student, awards, verificationCode) {
  const doc = await PDFDocument.load(await loadTemplateBytes());
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const sortedAwards = sortAwardsOldestFirst(awards);
  const stamps = await embedStamps(doc, sortedAwards);

  const stampCardGroups = chunk(sortedAwards, PAGE_3.maxCards);
  const tableRowGroups = chunk(sortedAwards, PAGE_4.maxRows);
  const pageEntries = await buildPageEntries(doc, stampCardGroups.length, tableRowGroups.length);

  await drawPage1(doc, pageEntries[0].page, student, verificationCode, fonts);
  stampCardGroups.forEach((group, index) => {
    drawPage3(findPages(pageEntries, TEMPLATE_PAGE.STAMP_CARDS)[index], group, fonts, stamps);
  });
  tableRowGroups.forEach((group, index) => {
    drawPage4(findPages(pageEntries, TEMPLATE_PAGE.TABLE)[index], group, fonts, stamps);
  });
  pageEntries.forEach((entry) => {
    drawPassportIdFooter(entry.page, entry.templateIndex, student.passportId, fonts);
  });

  return doc.save();
}

// Template pages are copied while they are still empty, so copies carry no drawn content.
// Result order: page 1, page 2, stamp card pages, table pages.
// Each entry remembers its template page, because the footer position depends on it.
async function buildPageEntries(doc, stampPageCount, tablePageCount) {
  for (let copyNumber = 1; copyNumber < stampPageCount; copyNumber++) {
    const [copy] = await doc.copyPages(doc, [TEMPLATE_PAGE.STAMP_CARDS]);
    doc.insertPage(TEMPLATE_PAGE.TABLE + copyNumber - 1, copy);
  }
  for (let copyNumber = 1; copyNumber < tablePageCount; copyNumber++) {
    const [copy] = await doc.copyPages(doc, [TEMPLATE_PAGE.TABLE + Math.max(stampPageCount - 1, 0)]);
    doc.addPage(copy);
  }

  const templateIndexes = [
    TEMPLATE_PAGE.COVER,
    TEMPLATE_PAGE.INFO,
    ...Array(Math.max(stampPageCount, 1)).fill(TEMPLATE_PAGE.STAMP_CARDS),
    ...Array(Math.max(tablePageCount, 1)).fill(TEMPLATE_PAGE.TABLE),
  ];
  return doc.getPages().map((page, index) => ({ page, templateIndex: templateIndexes[index] }));
}

function findPages(pageEntries, templateIndex) {
  return pageEntries.filter((entry) => entry.templateIndex === templateIndex).map((entry) => entry.page);
}

function chunk(items, size) {
  const groups = [];
  for (let start = 0; start < items.length; start += size) {
    groups.push(items.slice(start, start + size));
  }
  return groups;
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

async function drawPage1(doc, page, student, verificationCode, fonts) {
  drawText(page, student.firstName, fonts.regular, PAGE_1.name);
  drawText(page, student.lastName, fonts.regular, PAGE_1.surname);
  drawText(page, formatDate(student.firstIssued), fonts.regular, PAGE_1.date);
  await drawVerificationBlock(doc, page, verificationCode, fonts);
}

function buildVerifyUrl(verificationCode) {
  return `${config.publicBaseUrl}/verify/${verificationCode}`;
}

// QR with a link to the public verify page, and the code as text next to it
async function drawVerificationBlock(doc, page, verificationCode, fonts) {
  const qrBytes = await QRCode.toBuffer(buildVerifyUrl(verificationCode), {
    margin: 1,
    errorCorrectionLevel: 'M',
    width: 300,
  });
  const qrImage = await doc.embedPng(qrBytes);
  page.drawImage(qrImage, { x: PAGE_1.qr.x, y: PAGE_1.qr.y, width: PAGE_1.qr.size, height: PAGE_1.qr.size });

  drawText(page, 'VERIFICATION CODE:', fonts.regular, { ...PAGE_1.verificationLabel });
  drawText(page, verificationCode, fonts.bold, { ...PAGE_1.verificationCode });
}

function drawPassportIdFooter(page, pageIndex, passportId, fonts) {
  const footer = PASSPORT_ID_FOOTER[pageIndex];
  const width = fonts.regular.widthOfTextAtSize(passportId, footer.size);
  const x = footer.align === 'right' ? footer.x - width : footer.x;
  drawText(page, passportId, fonts.regular, { x, y: footer.y, size: footer.size });
}

function drawPage3(page, awards, fonts, stamps) {
  awards.forEach((award, index) => {
    const card = PAGE_3.cards[index];

    drawCenteredLine(page, formatDate(award.dateEarned), fonts.regular, PAGE_3.date.size, card.centerX, card.top - PAGE_3.date.offset);
    drawBackdrop(page, card.centerX, card.top - PAGE_3.backdrop.centerOffset, PAGE_3.backdrop);
    drawStamp(page, stamps.get(award.skillCategory), card.centerX, card.top - PAGE_3.stamp.centerOffset, PAGE_3.stamp);

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
  awards.forEach((award, index) => {
    const centerY = PAGE_4.rowCenters[index];

    drawBackdrop(page, PAGE_4.stamp.centerX, centerY, PAGE_4.backdrop);
    drawStamp(page, stamps.get(award.skillCategory), PAGE_4.stamp.centerX, centerY, PAGE_4.stamp);
    const skillFits = drawWrappedCentered(page, award.skillName.toUpperCase(), fonts.bold, PAGE_4.skill, centerY);
    const descriptionFits = drawWrappedCentered(page, award.skillDescription.toUpperCase(), fonts.regular, PAGE_4.description, centerY);
    warnIfNotFitting(skillFits, award, 'skill name');
    warnIfNotFitting(descriptionFits, award, 'description');
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

// Scales the image to fit the box (maxWidth x maxHeight) without stretching it
function drawStamp(page, image, centerX, centerY, { maxWidth, maxHeight }) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
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

// Fits the text into the row (smaller font if needed) and centers the block vertically on centerY.
// Returns false when the text does not fit even at the smallest font size.
function drawWrappedCentered(page, text, font, column, centerY) {
  const fitted = fitTextToCell(text, font, {
    ...column,
    minSize: PAGE_4.minFontSize,
    maxHeight: PAGE_4.cellMaxHeight,
  });
  const blockHeight = (fitted.lines.length - 1) * fitted.lineHeight;
  let baseline = centerY + blockHeight / 2 - fitted.size * HALF_CAP_HEIGHT;

  for (const line of fitted.lines) {
    drawCenteredLine(page, line, font, fitted.size, column.centerX, baseline);
    baseline -= fitted.lineHeight;
  }
  return fitted.fits;
}

function warnIfNotFitting(fits, award, fieldName) {
  if (!fits) {
    console.warn(`Warning: ${award.studentId} "${award.skillName}": ${fieldName} does not fit its cell at ${PAGE_4.minFontSize}pt.`);
  }
}

function toPdfColor({ r, g, b }) {
  return rgb(r / 255, g / 255, b / 255);
}
