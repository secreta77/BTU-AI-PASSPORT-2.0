// Decides which Sheet rows may go into a passport, by column U "Verification Status". Pure: no database, no Google.
// Only CONFIRMED skills are processed (task.md). Runs before the validator, so an incomplete PENDING row is skipped
// and not reported as an error.
import { SHEET_SYNC_STATUS, VERIFICATION_STATUS } from '../shared/constants.js';

// false when the Sheet has rows but no "Verification Status" column: then the filter is off and every row counts as CONFIRMED
export function sheetHasVerificationColumn(rows) {
  return rows.length === 0 || rows.some((row) => row.verificationStatus !== undefined);
}

// rows: all rows from the reader. The reader leaves `verificationStatus` out (undefined) when the Sheet has no such
// column, and sets null for an empty cell. Returns:
//   rows:    rows to process (go on to the validator)
//   skipped: PENDING / REJECTED rows, only counted in the sync summary [{ sheetRow, recordId, studentId, message }]
//   errors:  rows with a missing or unknown status [{ sheetRow, recordId, studentId, message }] (shown in column T)
//   untouchedRows: Set of sheetRow numbers the Sheet write-back must not change (PENDING / REJECTED)
export function filterByVerificationStatus(rows) {
  const result = { rows: [], skipped: [], errors: [], untouchedRows: new Set() };

  for (const row of rows) {
    const status = row.verificationStatus;

    // No such column in the Sheet: old behaviour (for example the test xlsx)
    if (status === undefined || status === VERIFICATION_STATUS.CONFIRMED) {
      result.rows.push(row);
    } else if (status === VERIFICATION_STATUS.PENDING || status === VERIFICATION_STATUS.REJECTED) {
      result.skipped.push(describeSkipped(row, status));
      result.untouchedRows.add(row.sheetRow);
    } else if (status === null) {
      handleEmptyStatus(row, result);
    } else {
      result.errors.push(describe(row, `invalid Verification Status "${status}"`));
    }
  }
  return result;
}

// Empty is not CONFIRMED. Only rows that were already synced before the column existed stay as they are.
function handleEmptyStatus(row, result) {
  if (row.syncStatus === SHEET_SYNC_STATUS.SYNCED) {
    result.rows.push(row);
    return;
  }
  result.errors.push(describe(row, 'status missing'));
}

function describeSkipped(row, status) {
  // A synced row whose status changed later keeps its skill in the passport: skills are never removed
  if (row.syncStatus === SHEET_SYNC_STATUS.SYNCED) {
    return describe(row, 'status changed after sync, ignored');
  }
  return describe(row, `skipped (${status})`);
}

function describe(row, text) {
  return {
    sheetRow: row.sheetRow,
    recordId: row.recordId ?? null,
    studentId: row.studentId ?? null,
    message: `Row ${row.sheetRow}: ${text}`,
  };
}
