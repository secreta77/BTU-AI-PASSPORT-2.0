// Writes back to the Sheet with ONE batchUpdate call:
//   Q–T: the sync result of each row (system-managed columns)
//   G–H: Passport ID and First Issued of a new student, written to all rows of the student (CLAUDE.md, critical rules)
// The other input columns (A–F, I–P) are never written here.
import { config } from '../config.js';
import { SHEET_SYNC_STATUS } from '../shared/constants.js';
import { getSheetsApi, SHEET_NAME } from './googleClient.js';

const SYNC_COLUMNS = { first: 'Q', last: 'T', count: 4 }; // status, version, synced at, error
const PASSPORT_COLUMNS = { first: 'G', last: 'H', count: 2 }; // passport ID, first issued
const FIRST_DATA_ROW = 2; // Row 1 is never data. Real row numbers come from the reader (sheetRow).

// "2026-10-22T14:05:30.000Z" -> "2026-10-22 14:05 UTC", the same text format the Sheet already uses
function formatSyncedAt(date) {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

// One outcome -> the 4 cells for Q–T:
//   synced:     ['SYNCED', 'V2', '2026-10-22 14:05 UTC', '']
//   not synced: ['NOT SYNCED', '', '', 'error text']   (R and S stay empty: no version exists yet)
export function buildSyncCells({ synced, version, syncedAt, error }) {
  if (!synced) {
    return [SHEET_SYNC_STATUS.NOT_SYNCED, '', '', error ?? ''];
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`version must be a whole number from 1, got ${version}`);
  }
  if (!(syncedAt instanceof Date) || Number.isNaN(syncedAt.getTime())) {
    throw new Error('syncedAt must be a valid Date');
  }
  return [SHEET_SYNC_STATUS.SYNCED, `V${version}`, formatSyncedAt(syncedAt), error ?? ''];
}

// results: [{ sheetRow, synced, version, syncedAt, error }] -> writes Q–T of all those rows in one call.
// `sheetsApi` is the last argument and defaults to the real Google client (tests pass a fake one).
export async function writeSyncResults(results, sheetsApi = null) {
  const rows = results.map((result) => ({ sheetRow: result.sheetRow, cells: buildSyncCells(result) }));
  return writeSyncCells(rows, sheetsApi);
}

// Lower level: rows are [{ sheetRow, cells: [Q, R, S, T] }] with ready cell text (null counts as empty).
// Returns how many rows were written. One API call for all rows, however many there are.
export async function writeSyncCells(rows, sheetsApi = null) {
  if (rows.length === 0) {
    return 0;
  }
  await sendBatchUpdate(buildRangeData(rows, SYNC_COLUMNS), sheetsApi);
  return rows.length;
}

// What the sync writes at the end: Q–T for rows whose result changed and G–H for rows of new students.
// syncRows: [{ sheetRow, cells: [Q, R, S, T] }], passportRows: [{ sheetRow, cells: [passportId, firstIssued] }]
// Everything goes into ONE API call. Returns how many rows of each kind were written.
export async function writeSheetUpdates({ syncRows = [], passportRows = [] }, sheetsApi = null) {
  const data = [...buildRangeData(syncRows, SYNC_COLUMNS), ...buildRangeData(passportRows, PASSPORT_COLUMNS)];
  if (data.length === 0) {
    return { syncRows: 0, passportRows: 0 };
  }
  await sendBatchUpdate(data, sheetsApi);
  return { syncRows: syncRows.length, passportRows: passportRows.length };
}

// Checks the rows and turns them into the `data` items of values.batchUpdate: [{ range, values }]
function buildRangeData(rows, columns) {
  const label = `${columns.first}–${columns.last}`;
  const seenRows = new Set();

  return rows.map(({ sheetRow, cells }) => {
    if (!Number.isInteger(sheetRow) || sheetRow < FIRST_DATA_ROW) {
      throw new Error(`sheetRow must be a Sheet row number from ${FIRST_DATA_ROW}, got ${sheetRow}`);
    }
    if (seenRows.has(sheetRow)) {
      throw new Error(`Sheet row ${sheetRow} appears twice in one write`);
    }
    seenRows.add(sheetRow);
    if (cells.length !== columns.count) {
      throw new Error(`Row ${sheetRow}: expected ${columns.count} cells (${label}), got ${cells.length}`);
    }
    return {
      range: `'${SHEET_NAME}'!${columns.first}${sheetRow}:${columns.last}${sheetRow}`,
      values: [cells.map((cell) => cell ?? '')],
    };
  });
}

async function sendBatchUpdate(data, sheetsApi) {
  const { sheetId } = config.google;
  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID is empty. Fill it in server/.env (see server/.env.example).');
  }
  const api = sheetsApi ?? (await getSheetsApi());
  try {
    await api.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      // RAW: the text is stored as it is, so Google does not turn "V2" or the date text into something else
      requestBody: { valueInputOption: 'RAW', data },
    });
  } catch (error) {
    throw explainWriteError(error);
  }
}

// Turns Google's short error into a message that says what to fix
function explainWriteError(error) {
  const status = Number(error.status ?? error.response?.status ?? error.code);
  if (status === 403) {
    return new Error(
      'No write access to the Google Sheet. Share it as Editor (not Viewer) with the service account email: '
      + 'the "client_email" value in the credentials JSON file.',
    );
  }
  if (status === 404) {
    return new Error('Google Sheet not found. Check GOOGLE_SHEET_ID in server/.env.');
  }
  return error;
}
