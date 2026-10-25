// Dev helper: tests the offline parts of `npm run preflight` (settings check, hiding secrets, time limit, exit code).
// Run: npm run preflight-test. The live checks themselves are tested by running `npm run preflight`.
import assert from 'node:assert/strict';
import {
  checkEnvironment, exitCodeFor, formatResult, judgeBrevoSenders, looksLikeApiKeyUrl, redact, runCheck, sensitiveValues, STATUS, summarize,
} from './helpers/preflightCore.js';

// Secrets that are easy to find in an output
const SECRETS = {
  databaseUrl: 'postgresql://user:DB-PASSWORD-12345@db.example.supabase.co:5432/postgres',
  serviceKey: 'SERVICE-KEY-abcdefghijklmnop',
  privateKey: `0x${'ab'.repeat(32)}`,
  salt: 'SALT-0123456789abcdefghij',
  jwt: 'JWT-0123456789abcdefghij',
  admin: 'ADMIN-0123456789abcdefghij',
  rpc: 'https://rpc.example/v3/RPC-KEY-0123456789abcdef',
  smtpPass: 'SMTP-PASSWORD-123',
  brevoKey: 'BREVO-KEY-0123456789abcdef',
};

// A complete, good config
function goodConfig(overrides = {}) {
  return {
    publicBaseUrl: 'https://btu-passport.example',
    databaseUrl: SECRETS.databaseUrl,
    google: { sheetId: 'sheet-id-123', credentialsPath: './credentials/key.json' },
    supabase: { url: 'https://project.supabase.co', serviceKey: SECRETS.serviceKey, bucket: 'passports' },
    chain: {
      issuerPrivateKey: SECRETS.privateKey,
      contractAddress: `0x${'7c'.repeat(20)}`,
      chainId: 11155111,
      rpcUrls: [SECRETS.rpc, 'https://rpc-2.example'],
      publicRpcUrls: ['https://public-1.example', 'https://public-2.example'],
    },
    passportRefSalt: SECRETS.salt,
    smtp: { host: '', user: '', pass: SECRETS.smtpPass },
    mail: { brevoApiKey: '', from: '' },
    jwtSecret: SECRETS.jwt,
    adminApiKey: SECRETS.admin,
    ...overrides,
  };
}

// A good config with one change deep inside
function changed(path, value) {
  const config = structuredClone(goodConfig());
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((object, key) => object[key], config)[last] = value;
  return config;
}

const failedNames = (results) => results.filter((result) => result.status === STATUS.FAIL).map((result) => result.label);
const warnedNames = (results) => results.filter((result) => result.status === STATUS.WARN).map((result) => result.label);

let step = 0;
let failed = false;
async function scenario(name, work) {
  step += 1;
  try {
    await work();
    console.log(`ok ${step}  ${name}`);
  } catch (error) {
    failed = true;
    console.log(`FAILED ${step}  ${name}\n   ${error.message}`);
  }
}

await scenario('a complete config has no ❌ and no ⚠️', () => {
  const results = checkEnvironment(goodConfig());
  assert.deepEqual(failedNames(results), []);
  assert.deepEqual(warnedNames(results), []);
  assert(results.some((result) => result.status === STATUS.OK && /14 required settings/.test(result.detail)));
});

await scenario('every empty required setting is a ❌ that names it', () => {
  const cases = {
    'databaseUrl': 'DATABASE_URL', 'google.sheetId': 'GOOGLE_SHEET_ID', 'google.credentialsPath': 'GOOGLE_CREDENTIALS_PATH',
    'supabase.url': 'SUPABASE_URL', 'supabase.serviceKey': 'SUPABASE_SERVICE_KEY', 'supabase.bucket': 'SUPABASE_BUCKET',
    'chain.issuerPrivateKey': 'ISSUER_PRIVATE_KEY', 'chain.contractAddress': 'CONTRACT_ADDRESS', 'chain.chainId': 'CHAIN_ID',
    'passportRefSalt': 'PASSPORT_REF_SALT', 'jwtSecret': 'JWT_SECRET', 'adminApiKey': 'ADMIN_API_KEY',
    'chain.rpcUrls': 'RPC_URLS', 'chain.publicRpcUrls': 'PUBLIC_RPC_URLS',
  };
  for (const [path, name] of Object.entries(cases)) {
    const empty = path.startsWith('chain.chainId') ? null : (path.endsWith('Urls') ? [] : '');
    assert.deepEqual(failedNames(checkEnvironment(changed(path, empty))), [name], `${name} was not reported`);
  }
});

await scenario('values of the wrong shape are ❌: key, address, URLs, short secrets', () => {
  const wrong = [
    ['chain.issuerPrivateKey', 'not-a-key', 'ISSUER_PRIVATE_KEY'],
    ['chain.contractAddress', '0x1234', 'CONTRACT_ADDRESS'],
    ['databaseUrl', 'mysql://x', 'DATABASE_URL'],
    ['supabase.url', 'http://project.supabase.co', 'SUPABASE_URL'],
    ['jwtSecret', 'short', 'JWT_SECRET'],
    ['adminApiKey', 'short', 'ADMIN_API_KEY'],
    ['passportRefSalt', 'short', 'PASSPORT_REF_SALT'],
    ['chain.chainId', 1.5, 'CHAIN_ID'],
    ['chain.rpcUrls', ['rpc.example'], 'RPC_URLS'],
  ];
  for (const [path, value, name] of wrong) {
    assert.deepEqual(failedNames(checkEnvironment(changed(path, value))), [name], `${name} was accepted`);
  }
});

await scenario('a private key without 0x is ❌ with a hint (ethers refuses it; MetaMask shows keys without 0x)', () => {
  const results = checkEnvironment(changed('chain.issuerPrivateKey', 'ab'.repeat(32)));
  assert.deepEqual(failedNames(results), ['ISSUER_PRIVATE_KEY']);
  assert(results.find((result) => result.status === STATUS.FAIL).detail.includes('add it in front'));
  assert(!JSON.stringify(results).includes('ab'.repeat(32)), 'the key is in the output');
});

await scenario('warnings: another network, one RPC URL, a key-like public URL, a local site address, half-filled SMTP', () => {
  assert.deepEqual(warnedNames(checkEnvironment(changed('chain.chainId', 1))), ['CHAIN_ID']);
  assert.deepEqual(warnedNames(checkEnvironment(changed('chain.rpcUrls', ['https://rpc-1.example']))), ['RPC_URLS']);
  assert.deepEqual(warnedNames(checkEnvironment(changed('chain.publicRpcUrls', ['https://a.example', 'https://b.example/v3/0123456789abcdef0123456789abcdef']))), ['PUBLIC_RPC_URLS']);
  assert.deepEqual(warnedNames(checkEnvironment(changed('publicBaseUrl', 'http://localhost:4200'))), ['PUBLIC_BASE_URL']);
  assert.deepEqual(warnedNames(checkEnvironment(changed('smtp.host', 'smtp.example'))), ['SMTP_*']);
});

await scenario('API key detection: key in the path or in the query, but not a plain host', () => {
  assert(looksLikeApiKeyUrl('https://rpc.example/v3/0123456789abcdef0123456789abcdef'));
  assert(looksLikeApiKeyUrl('https://rpc.example/?apikey=abc'));
  assert(!looksLikeApiKeyUrl('https://rpc.sepolia.org'));
  assert(!looksLikeApiKeyUrl('https://ethereum-sepolia-rpc.publicnode.com'));
  assert(!looksLikeApiKeyUrl('not a url'));
});

await scenario('NO secret value appears in the results of the settings check, whatever is wrong', () => {
  const configs = [
    goodConfig(),
    changed('jwtSecret', 'short'),
    changed('chain.issuerPrivateKey', 'not-a-key'),
    changed('chain.publicRpcUrls', [SECRETS.rpc]),
    changed('smtp.host', 'smtp.example'),
    { ...goodConfig(), mail: { brevoApiKey: SECRETS.brevoKey, from: '' } },
  ];
  for (const config of configs) {
    const text = JSON.stringify(checkEnvironment(config));
    for (const [name, value] of Object.entries(SECRETS)) {
      assert(!text.includes(value), `${name} is in the output`);
    }
  }
});

await scenario('Brevo settings: a key needs MAIL_FROM; with both set the SMTP lines are gone', () => {
  const withKey = (from) => ({ ...goodConfig(), mail: { brevoApiKey: SECRETS.brevoKey, from } });
  assert.deepEqual(failedNames(checkEnvironment(withKey(''))), ['MAIL_FROM']);
  assert.match(checkEnvironment(withKey('')).find((result) => result.label === 'MAIL_FROM').detail, /is empty/);
  assert.deepEqual(failedNames(checkEnvironment(withKey('not-an-address'))), ['MAIL_FROM']);
  const good = checkEnvironment(withKey('sender@example.org'));
  assert.deepEqual(failedNames(good), []);
  assert.deepEqual(warnedNames(good), []);
  assert(good.some((result) => result.label === 'BREVO_*' && result.status === STATUS.OK));
  assert(!good.some((result) => result.label === 'SMTP_*'), 'SMTP_* must not be judged when Brevo is used');
  const halfSmtp = checkEnvironment({ ...withKey('sender@example.org'), smtp: { host: 'smtp.example', user: '', pass: '' } });
  assert.deepEqual(warnedNames(halfSmtp), [], 'a half-filled SMTP is irrelevant when Brevo is used');
});

await scenario('the Brevo key is a secret: redact hides it and the settings check never shows it', () => {
  const config = { ...goodConfig(), mail: { brevoApiKey: SECRETS.brevoKey, from: '' } };
  assert(sensitiveValues(config).includes(SECRETS.brevoKey));
  assert(!redact(`Brevo said ${SECRETS.brevoKey}`, sensitiveValues(config)).includes(SECRETS.brevoKey));
  assert(!JSON.stringify(checkEnvironment(config)).includes(SECRETS.brevoKey));
});

await scenario('Brevo senders answer: a confirmed sender is ✅; a bad key, a missing or unconfirmed sender explain themselves', () => {
  const sender = (overrides = {}) => ({ status: 200, body: { senders: [{ id: 1, name: 'BTU', email: 'Sender@Example.org', active: true, ...overrides }] } });
  assert.match(judgeBrevoSenders(sender(), 'sender@example.org'), /sender is confirmed/);
  assert.throws(() => judgeBrevoSenders(sender(), 'other@example.org'), /not a sender in Brevo/);
  assert.throws(() => judgeBrevoSenders(sender({ active: false }), 'sender@example.org'), /not confirmed yet/);
  assert.throws(() => judgeBrevoSenders({ status: 401, body: { message: 'Key not found' } }, 'sender@example.org'), /refused the API key/);
  assert.throws(() => judgeBrevoSenders({ status: 403, body: null }, 'sender@example.org'), /refused the API key/);
  assert.throws(() => judgeBrevoSenders({ status: 500, body: null }, 'sender@example.org'), /HTTP 500/);
  assert.throws(() => judgeBrevoSenders({ status: 200, body: null }, 'sender@example.org'), /not a sender in Brevo/);
});

await scenario('redact hides every secret, also inside an error text, and leaves other text alone', () => {
  const secrets = sensitiveValues(goodConfig());
  const text = `connect failed for ${SECRETS.databaseUrl} with key ${SECRETS.privateKey} and ${SECRETS.privateKey.slice(2)} via ${SECRETS.rpc}`;
  const safe = redact(text, secrets);
  for (const value of [SECRETS.databaseUrl, SECRETS.privateKey, SECRETS.privateKey.slice(2), SECRETS.rpc]) {
    assert(!safe.includes(value));
  }
  assert(safe.startsWith('connect failed for ***'));
  assert.equal(redact('nothing secret here', secrets), 'nothing secret here');
  assert(secrets.includes(SECRETS.smtpPass) && secrets.includes(SECRETS.admin) && secrets.includes(SECRETS.jwt) && secrets.includes(SECRETS.salt));
});

await scenario('runCheck: a text is ✅, a result or a list keeps its status and label', async () => {
  const [plain] = await runCheck('Database', () => 'connected');
  assert.deepEqual(plain, { status: 'ok', label: 'Database', detail: 'connected' });

  const [warning] = await runCheck('Sheet', () => ({ status: STATUS.WARN, detail: '2 rows have problems' }));
  assert.deepEqual(warning, { status: 'warn', label: 'Sheet', detail: '2 rows have problems' });

  const many = await runCheck('RPC', async () => [
    { status: STATUS.OK, label: 'RPC 1', detail: 'block 5' },
    { status: STATUS.FAIL, label: 'RPC 2', detail: 'down' },
  ]);
  assert.deepEqual(many.map((result) => result.label), ['RPC 1', 'RPC 2']);
  assert.deepEqual(many.map((result) => result.status), ['ok', 'fail']);
});

await scenario('runCheck: a thrown error is ❌ with its message, and the next check still runs', async () => {
  const [broken] = await runCheck('Storage', () => { throw new Error('bucket not found'); });
  assert.deepEqual(broken, { status: 'fail', label: 'Storage', detail: 'bucket not found' });
  const [asyncBroken] = await runCheck('Sheet', async () => { throw new Error('403 forbidden'); });
  assert.equal(asyncBroken.status, 'fail');
  const [next] = await runCheck('Mail', () => 'ready');
  assert.equal(next.status, 'ok');
});

await scenario('runCheck: a check that never answers is ❌ after the time limit', async () => {
  const started = Date.now();
  const [stuck] = await runCheck('RPC', () => new Promise(() => {}), { timeoutMs: 50 });
  assert.equal(stuck.status, 'fail');
  assert.match(stuck.detail, /no answer in/);
  assert(Date.now() - started < 2000, 'waited too long');
});

await scenario('runCheck: secrets are removed from details and from error messages', async () => {
  const secrets = sensitiveValues(goodConfig());
  const [fromError] = await runCheck('Database', () => { throw new Error(`password authentication failed for ${SECRETS.databaseUrl}`); }, { secrets });
  assert(!fromError.detail.includes('DB-PASSWORD-12345'));
  const [fromDetail] = await runCheck('Chain', () => `using ${SECRETS.rpc}`, { secrets });
  assert(!fromDetail.detail.includes('RPC-KEY'));
  const [fromLabel] = await runCheck('Chain', () => ({ status: 'ok', label: `RPC ${SECRETS.rpc}`, detail: '' }), { secrets });
  assert(!fromLabel.label.includes('RPC-KEY'));
});

await scenario('output lines and exit code: any ❌ makes the exit code 1, ⚠️ alone does not', () => {
  assert.equal(formatResult({ status: 'ok', label: 'Database', detail: 'connected' }), '✅ Database — connected');
  assert.equal(formatResult({ status: 'fail', label: 'Sheet', detail: '' }), '❌ Sheet');
  assert.match(formatResult({ status: 'warn', label: 'ABI', detail: 'missing' }), /^⚠️ +ABI — missing$/);

  const results = [{ status: 'ok' }, { status: 'warn' }, { status: 'warn' }];
  assert.deepEqual(summarize(results), { ok: 1, warn: 2, fail: 0 });
  assert.equal(exitCodeFor(results), 0);
  assert.equal(exitCodeFor([...results, { status: 'fail' }]), 1);
  assert.equal(exitCodeFor([]), 0);
});

console.log(failed ? '\nSome scenarios FAILED.' : `\nAll ${step} scenarios passed.`);
process.exitCode = failed ? 1 : 0;
