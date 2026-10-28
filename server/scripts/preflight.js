// Is everything ready? One command that checks the settings, the database, Storage, the Google Sheet, the blockchain
// and the login mail, and prints ✅ / ⚠️ / ❌ for each. Run: npm run preflight
// It only READS: it writes nothing, sends no transaction and no mail. It never prints a secret, only names and
// public values (addresses, host names, counts). Exit code 1 if anything is ❌.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import {
  checkCredentialsFile, checkEnvironment, exitCodeFor, formatResult, judgeBrevoSenders, ok, runCheck, sensitiveValues, STATUS, summarize, warn,
} from './helpers/preflightCore.js';

const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_TABLES = ['students', 'passports', 'skills', 'skill_awards', 'passport_versions', 'sync_log', 'otp_codes'];
const MIN_POSTGRES_VERSION_NUM = 150000; // schema.sql uses NULLS NOT DISTINCT
const MIN_ISSUER_BALANCE_ETH = 0.02; // the bootstrap sends about 18 transactions
const RPC_TIME_LIMIT_MS = 15_000;
const SMTP_PORT = 587; // the same port the login mail uses
const BREVO_SENDERS_URL = 'https://api.brevo.com/v3/senders';

const secrets = sensitiveValues(config);
const allResults = [];
const found = { students: null, abiReady: false, workingRpcUrl: null, issuerAddress: null };

// Runs one check, prints its lines at once (so a slow check does not hide the earlier ones) and remembers them
async function check(label, work, options = {}) {
  const results = await runCheck(label, work, { secrets, ...options });
  for (const result of results) {
    console.log(formatResult(result));
  }
  allResults.push(...results);
}

function heading(title) {
  console.log(`\n${title}`);
}

// ---------- Settings ----------

heading('Settings');
await check('Settings', () => checkEnvironment(config));
await check('Google key file', () => checkCredentialsFile(config.google.credentialsPath, { serverDir }));

// ---------- Database ----------

heading('Database');
await check('Database', async () => {
  const { pool } = await import('../db/pool.js'); // stops with a clear message when DATABASE_URL is empty
  const { rows: info } = await pool.query(
    "SELECT current_database() AS name, current_setting('server_version_num')::int AS version_num, current_setting('server_version') AS version",
  );
  const results = [];
  if (info[0].version_num < MIN_POSTGRES_VERSION_NUM) {
    results.push({ status: STATUS.FAIL, label: 'PostgreSQL version', detail: `${info[0].version}: db/schema.sql needs 15 or newer` });
  } else {
    results.push(ok('Database', `connected to "${info[0].name}", PostgreSQL ${info[0].version}`));
  }

  const { rows: tables } = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  const missing = REQUIRED_TABLES.filter((name) => !tables.some((table) => table.table_name === name));
  if (missing.length > 0) {
    results.push({ status: STATUS.FAIL, label: 'Tables', detail: `missing: ${missing.join(', ')}. Run server/db/schema.sql in the Supabase SQL Editor` });
    return results;
  }
  results.push(ok('Tables', `all ${REQUIRED_TABLES.length} tables exist`));

  // An older database has no passports.public_token until db/migrations/2026-10-28-public-token.sql is run.
  // The server reads it, so a missing column would break GET /api/student/passport and /api/public/passport/:token.
  const { rows: tokenColumn } = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'passports' AND column_name = 'public_token'",
  );
  results.push(tokenColumn.length === 1
    ? ok('Public link token', 'passports.public_token exists')
    : { status: STATUS.FAIL, label: 'Public link token', detail: 'passports.public_token is missing. Run server/db/migrations/2026-10-28-public-token.sql in the Supabase SQL Editor' });

  const { rows } = await pool.query(
    `SELECT (SELECT count(*) FROM students)::int AS students,
            (SELECT count(*) FROM passport_versions)::int AS versions,
            (SELECT count(*) FROM skill_awards WHERE version_id IS NULL)::int AS waiting,
            (SELECT count(*) FROM sync_log WHERE level = 'error')::int AS errors`,
  );
  found.students = rows[0].students;
  results.push(ok('Data', `${rows[0].students} students, ${rows[0].versions} issued versions, `
    + `${rows[0].waiting} awards waiting for a version, ${rows[0].errors} errors in the sync log`));
  return results;
});

// ---------- Storage ----------

heading('Storage');
await check('Storage', async () => {
  const { getStorageBucket } = await import('../storage/storageService.js');
  const { error } = await getStorageBucket().list('', { limit: 1 });
  if (error) {
    throw new Error(`bucket "${config.supabase.bucket}": ${error.message}`);
  }
  return `bucket "${config.supabase.bucket}" is reachable`;
});

// ---------- Google Sheet ----------

heading('Google Sheet');
await check('Google Sheet', async () => {
  const { readRowsFromGoogleSheet } = await import('../sheets/reader.js');
  const { validateRows } = await import('../sheets/validator.js');
  const { sheetHasVerificationColumn } = await import('../sync/statusFilter.js');
  const rows = await readRowsFromGoogleSheet();
  const { valid, errors } = validateRows(rows);
  const text = `${rows.length} rows read, ${valid.length} valid`;
  const notes = [];
  if (errors.length > 0) {
    notes.push(`${errors.length} with a problem (the sync shows each one in column T)`);
  }
  if (!sheetHasVerificationColumn(rows)) {
    notes.push('column U "Verification Status" not found: every row is treated as CONFIRMED');
  }
  return notes.length === 0 ? text : warn('Google Sheet', `${text}, ${notes.join('; ')}`);
});

// ---------- Blockchain ----------

heading('Blockchain');
await check('Contract ABI', () => {
  const abi = JSON.parse(fs.readFileSync(new URL('../chain/abi.json', import.meta.url), 'utf8'));
  found.abiReady = Array.isArray(abi) && abi.length > 0;
  return found.abiReady ? `server/chain/abi.json has ${abi.length} entries` : warn('Contract ABI', 'server/chain/abi.json is empty: Giorgi pastes it from Remix. Contract calls are skipped');
});

// Asks one RPC for its chain and latest block. Shows the host only: the full URL can hold a key.
async function askRpc(kind, url) {
  const host = new URL(url).host;
  const provider = new ethers.JsonRpcProvider(url, config.chain.chainId, { staticNetwork: true });
  try {
    const chainId = Number(BigInt(await provider.send('eth_chainId', [])));
    const block = Number(BigInt(await provider.send('eth_blockNumber', [])));
    if (chainId !== config.chain.chainId) {
      return { status: STATUS.FAIL, label: `RPC ${kind} ${host}`, detail: `answers for chain ${chainId}, but CHAIN_ID is ${config.chain.chainId}` };
    }
    if (kind === 'server' && found.workingRpcUrl === null) {
      found.workingRpcUrl = url;
    }
    return ok(`RPC ${kind} ${host}`, `chain ${chainId}, block ${block}`);
  } finally {
    provider.destroy();
  }
}

const rpcTargets = [
  ...config.chain.rpcUrls.map((url) => ['server', url]),
  ...config.chain.publicRpcUrls.map((url) => ['public', url]),
].filter(([, url]) => /^https?:\/\//.test(url));
if (config.chain.chainId === null) {
  console.log('⚠️  RPC — skipped: CHAIN_ID is empty');
} else {
  for (const [kind, url] of rpcTargets) {
    await check(`RPC ${kind} ${new URL(url).host}`, () => askRpc(kind, url), { timeoutMs: RPC_TIME_LIMIT_MS });
  }
}

await check('Issuer wallet', async () => {
  let address;
  try {
    address = new ethers.Wallet(config.chain.issuerPrivateKey).address;
  } catch {
    // The library's own message is not shown: it could contain a part of the key
    throw new Error('ISSUER_PRIVATE_KEY is not a valid private key');
  }
  found.issuerAddress = address;
  if (found.workingRpcUrl === null) {
    return warn('Issuer wallet', `${address} (balance not checked: no RPC answered)`);
  }
  const provider = new ethers.JsonRpcProvider(found.workingRpcUrl, config.chain.chainId, { staticNetwork: true });
  try {
    const balance = Number(ethers.formatEther(await provider.getBalance(address)));
    const detail = `${address} has ${balance.toFixed(4)} ETH`;
    return balance >= MIN_ISSUER_BALANCE_ETH
      ? ok('Issuer wallet', detail)
      : warn('Issuer wallet', `${detail}; the bootstrap needs about ${MIN_ISSUER_BALANCE_ETH} (18 transactions)`);
  } finally {
    provider.destroy();
  }
}, { timeoutMs: RPC_TIME_LIMIT_MS });

await check('Contract', async () => {
  if (found.workingRpcUrl === null) {
    return warn('Contract', 'not checked: no RPC answered');
  }
  const provider = new ethers.JsonRpcProvider(found.workingRpcUrl, config.chain.chainId, { staticNetwork: true });
  try {
    const code = await provider.getCode(config.chain.contractAddress);
    if (code === '0x') {
      throw new Error(`no contract at ${config.chain.contractAddress} on chain ${config.chain.chainId}`);
    }
  } finally {
    provider.destroy();
  }
  if (!found.abiReady) {
    return ok('Contract', `code found at ${config.chain.contractAddress} (issuer not checked: no ABI yet)`);
  }
  const { issuer } = await import('../chain/chainService.js');
  const contractIssuer = await issuer();
  if (found.issuerAddress && contractIssuer.toLowerCase() !== found.issuerAddress.toLowerCase()) {
    throw new Error(`the contract accepts writes only from ${contractIssuer}, but the key in .env belongs to ${found.issuerAddress}`);
  }
  return `code found at ${config.chain.contractAddress}, issuer ${contractIssuer} matches the wallet in .env`;
}, { timeoutMs: RPC_TIME_LIMIT_MS });

// ---------- Login mail ----------

heading('Login mail');
await check('Login mail', async () => {
  if (config.mail.brevoApiKey !== '') {
    // Reads the sender list: proves that the key works and that MAIL_FROM is a confirmed sender. Sends no mail.
    const response = await fetch(BREVO_SENDERS_URL, {
      headers: { 'api-key': config.mail.brevoApiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(RPC_TIME_LIMIT_MS),
    });
    const body = await response.json().catch(() => null);
    return judgeBrevoSenders({ status: response.status, body }, config.mail.from);
  }
  if (config.smtp.host === '') {
    await nodemailer.createTestAccount(); // proves that the test inbox (Ethereal) can be reached from here
    return 'test inbox (Ethereal) is reachable';
  }
  const transport = nodemailer.createTransport({
    host: config.smtp.host, port: SMTP_PORT, auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  await transport.verify();
  return `mail server ${config.smtp.host} accepts the login`;
});

// ---------- Result ----------

const summary = summarize(allResults);
console.log(`\n${summary.ok} ✅   ${summary.warn} ⚠️    ${summary.fail} ❌`);
if (summary.fail > 0) {
  console.log('Fix the ❌ lines first, then run npm run preflight again.');
} else if (!found.abiReady) {
  console.log('Waiting for the contract ABI (Giorgi). Then: npm run chain-check, npm run preflight, npm run bootstrap.');
} else if (found.students === 0) {
  console.log('Ready for the first run: npm run bootstrap (about 18 Sepolia transactions).');
} else {
  console.log('Ready: npm start, or npm run sync.');
}

// Close the database connection, but never wait long for it: a database that did not answer would keep it open
async function closeDatabase() {
  try {
    const { pool } = await import('../db/pool.js');
    await pool.end();
  } catch {
    // the database check already reported why there is no pool
  }
}
await Promise.race([closeDatabase(), new Promise((resolve) => { setTimeout(resolve, 2000); })]);
process.exit(exitCodeFor(allResults));
