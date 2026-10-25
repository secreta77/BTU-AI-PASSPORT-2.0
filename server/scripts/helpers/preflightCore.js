// The parts of `npm run preflight` that need no network, so they can be tested (preflight-test.js):
// checking the .env settings, hiding secrets in the output, running one check with a time limit, printing results.
// A secret value must NEVER appear in the output: the checks name a setting, they do not show it.

export const STATUS = { OK: 'ok', WARN: 'warn', FAIL: 'fail' };

const ICON = { ok: '✅', warn: '⚠️ ', fail: '❌' };
const MIN_SECRET_LENGTH = 16;
const MIN_SENSITIVE_LENGTH = 8; // a shorter value would also hide ordinary words in the output
const SEPOLIA_CHAIN_ID = 11155111;
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/; // ethers refuses a key without 0x, and MetaMask shows it without
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const KEY_LIKE_SEGMENT = /^[A-Za-z0-9_-]{20,}$/;

const ok = (label, detail = '') => ({ status: STATUS.OK, label, detail });
const warn = (label, detail = '') => ({ status: STATUS.WARN, label, detail });
const fail = (label, detail = '') => ({ status: STATUS.FAIL, label, detail });
export { fail, ok, warn };

// ---------- Secrets ----------

// Every value of the config that must not be printed
export function sensitiveValues(config) {
  const privateKey = config.chain.issuerPrivateKey;
  return [
    config.databaseUrl,
    config.supabase.serviceKey,
    privateKey,
    privateKey.replace(/^0x/, ''),
    ...config.chain.rpcUrls,
    ...config.chain.publicRpcUrls,
    config.passportRefSalt,
    config.jwtSecret,
    config.adminApiKey,
    config.smtp.pass,
    config.mail.brevoApiKey,
  ].filter((value) => typeof value === 'string' && value.length >= MIN_SENSITIVE_LENGTH);
}

// Replaces every secret in a text with ***. Error messages of libraries sometimes contain the URL they called.
export function redact(text, secrets) {
  return secrets.reduce((safe, secret) => safe.split(secret).join('***'), String(text));
}

// ---------- The .env settings ----------

// "Is it filled and does it look right" for every setting. Never returns a value, only names.
export function checkEnvironment(config) {
  const results = [];
  const problems = [];
  let good = 0;

  function judge(name, value, validate = () => null) {
    const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    const problem = empty ? 'is empty' : validate(value);
    if (problem === null) {
      good += 1;
    } else {
      problems.push(fail(name, problem));
    }
  }

  const isUrl = (scheme) => (value) => (value.startsWith(scheme) ? null : `must start with ${scheme}`);
  const longEnough = (value) => (value.length >= MIN_SECRET_LENGTH ? null : `must have at least ${MIN_SECRET_LENGTH} characters`);

  judge('DATABASE_URL', config.databaseUrl, (value) => (/^postgres(ql)?:\/\//.test(value) ? null : 'must start with postgresql://'));
  judge('GOOGLE_SHEET_ID', config.google.sheetId);
  judge('GOOGLE_CREDENTIALS_PATH', config.google.credentialsPath);
  judge('SUPABASE_URL', config.supabase.url, isUrl('https://'));
  judge('SUPABASE_SERVICE_KEY', config.supabase.serviceKey);
  judge('SUPABASE_BUCKET', config.supabase.bucket);
  judge('ISSUER_PRIVATE_KEY', config.chain.issuerPrivateKey, (value) => (PRIVATE_KEY.test(value) ? null : 'must be 0x followed by 64 hex characters (MetaMask shows the key without 0x: add it in front)'));
  judge('CONTRACT_ADDRESS', config.chain.contractAddress, (value) => (ADDRESS.test(value) ? null : 'must look like 0x followed by 40 hex characters'));
  judge('CHAIN_ID', config.chain.chainId, (value) => (Number.isInteger(value) && value > 0 ? null : 'must be a whole number'));
  judge('PASSPORT_REF_SALT', config.passportRefSalt, longEnough);
  judge('JWT_SECRET', config.jwtSecret, longEnough);
  judge('ADMIN_API_KEY', config.adminApiKey, longEnough);
  judge('RPC_URLS', config.chain.rpcUrls, (urls) => (urls.every((url) => /^https?:\/\//.test(url)) ? null : 'every URL must start with https://'));
  judge('PUBLIC_RPC_URLS', config.chain.publicRpcUrls, (urls) => (urls.every((url) => /^https?:\/\//.test(url)) ? null : 'every URL must start with https://'));

  results.push(...problems);
  if (good > 0) {
    results.push(ok('Settings in server/.env', `${good} required settings are filled and look right`));
  }

  // Not wrong, but worth a look
  if (config.chain.chainId !== null && config.chain.chainId !== SEPOLIA_CHAIN_ID) {
    results.push(warn('CHAIN_ID', `the project uses Sepolia (${SEPOLIA_CHAIN_ID}), this is another network`));
  }
  if (config.chain.rpcUrls.length === 1) {
    results.push(warn('RPC_URLS', 'only one URL: with 2 or 3 the server can fall back when one is down (Decision 4)'));
  }
  if (config.chain.publicRpcUrls.length === 1) {
    results.push(warn('PUBLIC_RPC_URLS', 'only one URL: with 2 or 3 the verify page can fall back when one is down'));
  }
  if (config.chain.publicRpcUrls.some(looksLikeApiKeyUrl)) {
    results.push(warn('PUBLIC_RPC_URLS', 'a URL seems to contain an API key; this list goes to every browser, use public URLs only'));
  }
  if (isLocalAddress(config.publicBaseUrl)) {
    results.push(warn('PUBLIC_BASE_URL', 'points to this computer: fine while developing, but a QR code scanned with a phone will not open it (set it before the demo)'));
  }
  if (config.mail.brevoApiKey !== '') {
    results.push(...checkBrevoSettings(config.mail)); // Brevo replaces SMTP, so SMTP_* is not judged then
  } else if (config.smtp.host === '') {
    results.push(ok('SMTP_*', 'empty: login mails go to a test inbox (Ethereal) and the link is printed in the server console'));
  } else if (config.smtp.user === '' || config.smtp.pass === '') {
    results.push(warn('SMTP_*', 'SMTP_HOST is set but SMTP_USER or SMTP_PASS is empty'));
  }
  return results;
}

function checkBrevoSettings({ from }) {
  if (from === '') {
    return [fail('MAIL_FROM', 'is empty: Brevo needs the sender address that you confirmed in Brevo (Senders)')];
  }
  if (!/^[^@\s]+@[^@\s]+$/.test(from)) {
    return [fail('MAIL_FROM', 'is not an email address')];
  }
  return [ok('BREVO_*', 'login mails go through Brevo (HTTPS), not SMTP')];
}

// Reads the answer of GET /v3/senders: returns a text (✅) or throws an Error with the reason (❌ through runCheck)
export function judgeBrevoSenders({ status, body }, from) {
  if (status === 401 || status === 403) {
    throw new Error(`Brevo refused the API key (HTTP ${status}): make a new key under SMTP & API`);
  }
  if (status !== 200) {
    throw new Error(`Brevo answered HTTP ${status}`);
  }
  const senders = Array.isArray(body?.senders) ? body.senders : [];
  const sender = senders.find((item) => typeof item.email === 'string' && item.email.toLowerCase() === from.toLowerCase());
  if (sender === undefined) {
    throw new Error('MAIL_FROM is not a sender in Brevo: add it under Senders, then confirm the mail that Brevo sends');
  }
  if (sender.active === false) {
    throw new Error('the sender is in Brevo but not confirmed yet: open the confirmation mail from Brevo');
  }
  return 'Brevo accepts the key and the sender is confirmed';
}

// A URL whose query or long path part looks like a key (https://rpc.example/v3/0123456789abcdef0123456789abcdef)
export function looksLikeApiKeyUrl(url) {
  try {
    const { search, pathname } = new URL(url);
    return search !== '' || pathname.split('/').some((segment) => KEY_LIKE_SEGMENT.test(segment));
  } catch {
    return false;
  }
}

function isLocalAddress(url) {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

// ---------- Running one check ----------

// `work` returns a text (OK), one result, or a list of results. A thrown error or a missing answer becomes a ❌,
// so one broken check never stops the others. Secrets are removed from everything that comes out.
export async function runCheck(label, work, { timeoutMs = 20_000, secrets = [] } = {}) {
  let timer;
  try {
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer in ${Math.round(timeoutMs / 1000)} seconds`)), timeoutMs);
    });
    const answer = await Promise.race([Promise.resolve().then(work), timeout]);
    return normalize(label, answer).map((result) => cleaned(result, secrets));
  } catch (error) {
    return [cleaned(fail(label, error.message), secrets)];
  } finally {
    clearTimeout(timer);
  }
}

function normalize(label, answer) {
  const items = Array.isArray(answer) ? answer : [answer];
  return items.map((item) => (typeof item === 'string' ? ok(label, item) : { label, detail: '', ...item }));
}

function cleaned(result, secrets) {
  return { ...result, label: redact(result.label, secrets), detail: redact(result.detail ?? '', secrets) };
}

// ---------- Output ----------

export function formatResult(result) {
  return `${ICON[result.status]} ${result.label}${result.detail ? ` — ${result.detail}` : ''}`;
}

export function summarize(results) {
  const count = (status) => results.filter((result) => result.status === status).length;
  return { ok: count(STATUS.OK), warn: count(STATUS.WARN), fail: count(STATUS.FAIL) };
}

export function exitCodeFor(results) {
  return summarize(results).fail > 0 ? 1 : 0;
}
