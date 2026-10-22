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

function readText(name, fallback = '') {
  const value = (process.env[name] ?? '').trim();
  return value === '' ? fallback : value;
}

function readNumber(name, fallback = null) {
  const value = Number(readText(name));
  return Number.isNaN(value) || readText(name) === '' ? fallback : value;
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
    credentialsPath: readText('GOOGLE_CREDENTIALS_PATH'),
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
  jwtSecret: readText('JWT_SECRET'),
  adminApiKey: readText('ADMIN_API_KEY'),
};
