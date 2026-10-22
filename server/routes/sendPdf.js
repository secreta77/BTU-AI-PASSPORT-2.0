// Sends PDF bytes as a download. The student route and the admin routes use it, so the headers are the same everywhere.
const SAFE_FILE_NAME = /^[A-Za-z0-9._-]+$/; // no quotes or line breaks: the name goes into a header

export function sendPdf(res, pdfBytes, fileName) {
  if (!SAFE_FILE_NAME.test(fileName)) {
    throw new Error(`Unsafe PDF file name: ${fileName}`);
  }
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    // The passport is personal: no browser or proxy should keep a copy
    'Cache-Control': 'no-store',
  });
  res.send(pdfBytes);
}
