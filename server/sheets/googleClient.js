// Creates the Google Sheets API client from the service account file.
// The reader and the writer (writer.js) share it, so the login lives in one place.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const SHEET_NAME = 'Passport Skill Records'; // the tab with the data, shared by the reader and the writer
const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function getSheetsApi() {
  const { credentialsPath } = config.google;
  if (!credentialsPath) {
    throw new Error('GOOGLE_CREDENTIALS_PATH is empty. Fill it in server/.env (see server/.env.example).');
  }

  // Loaded here and not at the top: googleapis is big, and scripts that only read the local xlsx stay fast
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({
    // Relative paths in .env are relative to the server folder, not to the folder where the command runs
    keyFile: path.resolve(serverDir, credentialsPath),
    scopes: [SCOPE],
  });
  return google.sheets({ version: 'v4', auth });
}
