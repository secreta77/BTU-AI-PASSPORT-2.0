// Works out which Sheet cells must change so that the Sheet shows what the database knows.
// Pure: no database and no Google calls. The sync passes the result to writeSheetUpdates() (sheets/writer.js).
// Only cells that really differ are returned, so a repeated sync writes nothing.
import { buildSyncCells } from '../sheets/writer.js';

// rows: ALL rows read from the Sheet (also the invalid ones), with their current Q–T and G–H values
// dbState:
//   versionByRecordId:  Map recordId -> { version, issuedAt: Date } for awards that are in an issued version
//   passportByStudentId: Map studentId -> { passportId, firstIssued }
// messageByRow: Map sheetRow -> problem text (invalid row, duplicate, failed issuing). A row with a message is
//   NOT SYNCED and shows the text in column T, whatever the database knows about its record.
// Returns { syncRows: [{ sheetRow, cells: [Q, R, S, T] }], passportRows: [{ sheetRow, cells: [G, H] }] }
export function buildSheetUpdates(rows, dbState, messageByRow) {
  const syncRows = [];
  const passportRows = [];

  for (const row of rows) {
    const message = messageByRow.get(row.sheetRow) ?? null;

    const syncCells = desiredSyncCells(row, dbState, message);
    if (!sameCells(syncCells, [row.syncStatus, row.syncedVersion, row.syncedAt, row.syncError])) {
      syncRows.push({ sheetRow: row.sheetRow, cells: syncCells });
    }

    // Passport ID and First Issued go only into rows without a problem, so a broken row is never "fixed" silently
    const passportCells = message === null ? desiredPassportCells(row, dbState) : null;
    if (passportCells !== null && !sameCells(passportCells, [row.passportId, row.firstIssued])) {
      passportRows.push({ sheetRow: row.sheetRow, cells: passportCells });
    }
  }
  return { syncRows, passportRows };
}

function desiredSyncCells(row, dbState, message) {
  if (message !== null) {
    return buildSyncCells({ synced: false, error: message });
  }
  const issued = dbState.versionByRecordId.get(row.recordId);
  if (issued) {
    return buildSyncCells({ synced: true, version: issued.version, syncedAt: issued.issuedAt });
  }
  return buildSyncCells({ synced: false });
}

function desiredPassportCells(row, dbState) {
  const passport = dbState.passportByStudentId.get(row.studentId);
  return passport ? [passport.passportId, passport.firstIssued] : null;
}

// An empty cell and null are the same thing
function sameCells(desired, current) {
  return desired.every((cell, index) => (cell ?? '') === (current[index] ?? ''));
}
