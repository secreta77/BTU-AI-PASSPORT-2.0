// Shared text formatting helpers.

// "2026-09-15" -> "15.09.2026". Plain string split on purpose: no Date object, so no timezone shifts.
export function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}
