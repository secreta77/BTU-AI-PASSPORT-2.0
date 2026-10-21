// Reads all rows once from the local xlsx (exceljs). Google Sheets reader will return the same shape.
import ExcelJS from 'exceljs';

const SHEET_NAME = 'Passport Skill Records';
const HEADER_FIRST_CELL = 'Student ID';
const NOTES_FIRST_CELL_START = 'TECHNICAL NOTES';

// Column number (A = 1) -> field name. The only place where the column order is defined.
const COLUMNS = {
  1: 'studentId',
  2: 'firstName',
  3: 'lastName',
  4: 'email',
  5: 'program',
  6: 'educationLevel',
  7: 'passportId',
  8: 'firstIssued',
  9: 'studentStatus',
  10: 'recordId',
  11: 'skillId',
  12: 'skillName',
  13: 'skillCategory',
  14: 'stampCode',
  15: 'skillDescription',
  16: 'dateEarned',
  17: 'syncStatus',
  18: 'syncedVersion',
  19: 'syncedAt',
  20: 'syncError',
};

export async function readRowsFromXlsx(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found in ${filePath}`);
  }

  const headerRowNumber = findHeaderRowNumber(sheet);
  const rows = [];

  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = rowToObject(sheet.getRow(rowNumber), rowNumber);

    // Everything below this marker is documentation, not data
    if (isNotesRow(row)) break;
    // Empty rows are skipped, but they do not stop reading
    if (isEmptyRow(row)) continue;

    rows.push(row);
  }

  return rows;
}

function findHeaderRowNumber(sheet) {
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
    if (getCellValue(sheet.getRow(rowNumber).getCell(1)) === HEADER_FIRST_CELL) {
      return rowNumber;
    }
  }
  throw new Error(`Header row (first cell "${HEADER_FIRST_CELL}") not found`);
}

function rowToObject(excelRow, sheetRow) {
  const row = { sheetRow };
  for (const [columnNumber, fieldName] of Object.entries(COLUMNS)) {
    row[fieldName] = getCellValue(excelRow.getCell(Number(columnNumber)));
  }
  return row;
}

// Returns trimmed text or null. Formula cells (like Badge/Stamp Code) give their result.
function getCellValue(cell) {
  let value = cell.value;

  if (value && typeof value === 'object' && 'result' in value) {
    value = value.result;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text === '' ? null : text;
}

function isNotesRow(row) {
  return row.studentId !== null && row.studentId.toUpperCase().startsWith(NOTES_FIRST_CELL_START);
}

function isEmptyRow(row) {
  return Object.entries(row).every(([fieldName, value]) => fieldName === 'sheetRow' || value === null);
}
