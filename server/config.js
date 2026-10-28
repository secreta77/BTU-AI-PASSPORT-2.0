// Reads server/.env once and exports the config object. Other modules only read it, never change it.
// Empty values do not fail here: the module that needs a value checks it itself.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load .env by the server folder, not the current folder, so scripts work from any directory
const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDir, '.env') });

const DEFAULT_PORT = 3000;
const DEFAULT_PUBLIC_BASE_URL = 'http://localhost:4200'; // Angular dev server
const DEFAULT_GOOGLE_CREDENTIALS_PATH = './credentials/google-service-account.json'; // where the key lives on a dev computer

function readText(name, fallback = '') {
  const value = (process.env[name] ?? '').trim();
  return value === '' ? fallback : value;
}

function readNumber(name, fallback = null) {
  const value = Number(readText(name));
  return Number.isNaN(value) || readText(name) === '' ? fallback : value;
}

// true only for the words true / 1 / yes / on (any case); empty or anything else is false
function readFlag(name) {
  return ['true', '1', 'yes', 'on'].includes(readText(name).toLowerCase());
}

function readList(name) {
  return readText(name)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

export const config = {
  port: readNumber('PORT', DEFAULT_PORT),
  // No trailing slash, so `${publicBaseUrl}/verify/...` never gets a double slash
  publicBaseUrl: readText('PUBLIC_BASE_URL', DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, ''),
  databaseUrl: readText('DATABASE_URL'),
  google: {
    sheetId: readText('GOOGLE_SHEET_ID'),
    // GOOGLE_CREDENTIALS_PATH is ours; GOOGLE_APPLICATION_CREDENTIALS is Google's usual name and works too.
    // On Render set either one to /etc/secrets/<file name of the Secret File>.
    credentialsPath: readText('GOOGLE_CREDENTIALS_PATH', readText('GOOGLE_APPLICATION_CREDENTIALS', DEFAULT_GOOGLE_CREDENTIALS_PATH)),
  },
  supabase: {
    url: readText('SUPABASE_URL'),
    serviceKey: readText('SUPABASE_SERVICE_KEY'),
    bucket: readText('SUPABASE_BUCKET'),
  },
  chain: {
    issuerPrivateKey: readText('ISSUER_PRIVATE_KEY'),
    contractAddress: readText('CONTRACT_ADDRESS'),
    chainId: readNumber('CHAIN_ID'),
    // Server only, may contain an API key
    rpcUrls: readList('RPC_URLS'),
    // For the browser: public URLs only, never a key
    publicRpcUrls: readList('PUBLIC_RPC_URLS'),
  },
  // Secret salt for passportRef; must never change after the first issue
  passportRefSalt: readText('PASSPORT_REF_SALT'),
  smtp: {
    host: readText('SMTP_HOST'),
    user: readText('SMTP_USER'),
    pass: readText('SMTP_PASS'),
  },
  // Brevo mail API (HTTPS). When BREVO_API_KEY is set, login mails go through it instead of SMTP. It works on hosts
  // that block SMTP ports (Render free), because it is an ordinary HTTPS request.
  mail: {
    brevoApiKey: readText('BREVO_API_KEY'),
    from: readText('MAIL_FROM'), // the sender address confirmed in Brevo (Senders)
  },
  // NOTIFY_STUDENTS=true: e-mail the student when a new passport version is issued (needs the Brevo settings above)
  notify: {
    studentMail: readFlag('NOTIFY_STUDENTS'),
  },
  jwtSecret: readText('JWT_SECRET'),
  adminApiKey: readText('ADMIN_API_KEY'),
  // Minutes between automatic syncs. Empty or 0 = off (the default). Read in sync/autoSync.js
  autoSyncMinutes: readNumber('AUTO_SYNC_MINUTES', null),
};
