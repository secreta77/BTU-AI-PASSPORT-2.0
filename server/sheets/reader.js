// Reads all rows once and returns them as objects, from Google Sheets (production) or from the local xlsx
// (dev, offline). Both sources give the same shape: see rowsFromMatrix().
import ExcelJS from 'exceljs';
import { config } from '../config.js';
import { getSheetsApi, SHEET_NAME } from './googleClient.js';

const HEADER_FIRST_CELL = 'Student ID';
const NOTES_FIRST_CELL_START = 'TECHNICAL NOTES';
const VERIFICATION_HEADER = 'VERIFICATION STATUS'; // header of column U, compared without case and spaces

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
  21: 'verificationStatus', // after T, so Q–T keep their place. Optional: older Sheets do not have it
};
const VERIFICATION_COLUMN_INDEX = 20; // column U in a list of cells (A = 0)
const COLUMN_NUMBERS = Object.keys(COLUMNS).map(Number);

// Google gives a date cell as a serial number. These fields are dates, so we turn the number into YYYY-MM-DD.
const DATE_FIELDS = new Set(['firstIssued', 'dateEarned']);
const GOOGLE_EPOCH_OFFSET_DAYS = 25569; // days from 1899-12-30 (Google's day 0) to 1970-01-01
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------- Source 1: Google Sheet ----------

export async function readRowsFromGoogleSheet() {
  const { sheetId } = config.google;
  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID is empty. Fill it in server/.env (see server/.env.example).');
  }

  const sheetsApi = await getSheetsApi();
  let response;
  try {
    response = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${SHEET_NAME}'!A:U`,
      // Real values, not the text on the screen: a date shown as 9/12/2026 would depend on the Sheet language
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
  } catch (error) {
    throw await explainGoogleError(error, sheetsApi, sheetId);
  }

  return rowsFromGoogleResponse(response.data);
}

// Google's answer ({ range, values }) -> row objects. A separate function without network, so it can be tested.
// Google leaves out empty rows at the end and empty cells at the end of a row. Both become null.
export function rowsFromGoogleResponse({ range, values }) {
  const firstRowNumber = readFirstRowNumber(range);
  const emptyRowsBefore = Array.from({ length: firstRowNumber - 1 }, () => []);
  const matrix = [...emptyRowsBefore, ...(values ?? [])].map(googleRowToCells);
  return rowsFromMatrix(matrix);
}

// "'Passport Skill Records'!A1:U64" -> 1. The Sheet row numbers in sheetRow must be the real ones.
function readFirstRowNumber(range) {
  const match = /!\$?[A-Z]+(\d+)/.exec(range ?? '');
  return match ? Number(match[1]) : 1;
}

// One Google row -> list of cells in column order (index 0 = column A)
function googleRowToCells(googleRow) {
  return COLUMN_NUMBERS.map((columnNumber) => {
    return googleValueToText(googleRow[columnNumber - 1], COLUMNS[columnNumber]);
  });
}

// Returns trimmed text or null, like getCellValue() does for the xlsx
function googleValueToText(value, fieldName) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && DATE_FIELDS.has(fieldName)) {
    return serialNumberToDate(value);
  }

  const text = String(value).trim();
  return text === '' ? null : text;
}

function serialNumberToDate(serialNumber) {
  const milliseconds = (Math.floor(serialNumber) - GOOGLE_EPOCH_OFFSET_DAYS) * MS_PER_DAY;
  return new Date(milliseconds).toISOString().slice(0, 10);
}

// Turns Google's short error into a message that says what to fix
async function explainGoogleError(error, sheetsApi, sheetId) {
  const status = Number(error.status ?? error.response?.status ?? error.code);

  if (status === 403) {
    return new Error(
      'No access to the Google Sheet. Share it (Editor) with the service account email: '
      + 'the "client_email" value in the credentials JSON file.',
    );
  }
  if (status === 404) {
    return new Error('Google Sheet not found. Check GOOGLE_SHEET_ID in server/.env.');
  }
  if (status === 400) {
    const titles = await listTabTitles(sheetsApi, sheetId);
    if (titles !== null && !titles.includes(SHEET_NAME)) {
      return new Error(`Tab "${SHEET_NAME}" not found. Tabs in this Google Sheet: ${titles.join(', ')}`);
    }
  }
  return error;
}

// Tab names, or null if even this call fails (then the original error is reported)
async function listTabTitles(sheetsApi, sheetId) {
  try {
    const response = await sheetsApi.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: 'sheets.properties.title',
    });
    return response.data.sheets.map((sheet) => sheet.properties.title);
  } catch {
    return null;
  }
}

// ---------- Source 2: local xlsx (exceljs) ----------

export async function readRowsFromXlsx(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found in ${filePath}`);
  }

  const matrix = [];
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const excelRow = sheet.getRow(rowNumber);
    matrix.push(COLUMN_NUMBERS.map((columnNumber) => getCellValue(excelRow.getCell(columnNumber))));
  }
  return rowsFromMatrix(matrix);
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

// ---------- Shared: table of text -> row objects ----------

// matrix[0] is Sheet row 1, and every item is a list of cells in column order (text or null).
// Both sources end up here, so the rules below exist only once.
function rowsFromMatrix(matrix) {
  const headerIndex = matrix.findIndex((cells) => cells[0] === HEADER_FIRST_CELL);
  if (headerIndex === -1) {
    throw new Error(`Header row (first cell "${HEADER_FIRST_CELL}") not found`);
  }

  // Without this column the field is left out of the rows (undefined), so "no column" differs from "empty cell" (null)
  const verificationHeader = matrix[headerIndex][VERIFICATION_COLUMN_INDEX];
  const hasVerificationColumn = isVerificationHeader(verificationHeader);

  const rows = [];
  for (let index = headerIndex + 1; index < matrix.length; index++) {
    const row = cellsToObject(matrix[index], index + 1);

    // Everything below this marker is documentation, not data
    if (isNotesRow(row)) break;
    // Empty rows are skipped, but they do not stop reading
    if (isEmptyRow(row)) continue;

    if (hasVerificationColumn) {
      row.verificationStatus = row.verificationStatus?.toUpperCase() ?? null; // "confirmed " counts as CONFIRMED
    } else if (row.verificationStatus === null) {
      delete row.verificationStatus; // an old Sheet without the column: the filter stays off
    } else {
      // A status is written, but the header does not match (a typo). Stop: otherwise PENDING rows would be issued.
      throw new Error(`Row ${row.sheetRow} has "${row.verificationStatus}" in column U, but the header of column U is `
        + `${verificationHeader === null ? 'empty' : `"${verificationHeader}"`}. Name it "Verification Status".`);
    }

    rows.push(row);
  }
  return rows;
}

function isVerificationHeader(headerCell) {
  return headerCell !== null && headerCell !== undefined && headerCell.toUpperCase() === VERIFICATION_HEADER;
}

function cellsToObject(cells, sheetRow) {
  const row = { sheetRow };
  for (const columnNumber of COLUMN_NUMBERS) {
    row[COLUMNS[columnNumber]] = cells[columnNumber - 1] ?? null;
  }
  return row;
}

function isNotesRow(row) {
  return row.studentId !== null && row.studentId.toUpperCase().startsWith(NOTES_FIRST_CELL_START);
}

function isEmptyRow(row) {
  return Object.entries(row).every(([fieldName, value]) => fieldName === 'sheetRow' || value === null);
}
