// Dev helper: starts the REAL Express app on a free port with a FAKE database and sends real HTTP requests to it.
// It checks status codes, JSON shapes and the error format of docs/api.md. Run: npm run api-test
// It never touches the real database, Storage or chain, so it is safe to run any time.
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { config } from '../config.js';

const SECRET_RPC_URL = 'https://rpc.example/v2/SECRET-API-KEY'; // the server-only list; it must never reach the browser
const PUBLIC_RPC_URLS = ['https://public-1.example', 'https://public-2.example'];
const SITE_ORIGIN = 'https://btu-passport.example';

config.publicBaseUrl = SITE_ORIGIN;
config.chain.chainId = 11155111;
config.chain.contractAddress = '0x7c90CbDcB0006819E5dfdfb8D36A74f0f3968509';
config.chain.publicRpcUrls = PUBLIC_RPC_URLS;
config.chain.rpcUrls = [SECRET_RPC_URL];

// ---------- A fake ledger and a real server ----------

const ISSUED_AT = new Date('2026-10-21T10:15:00.000Z');
const TX_HASH = `0x${'3f'.repeat(32)}`;
const ledger = new Map([
  ['BTU-V-7F3K-92QX', {
    verificationCode: 'BTU-V-7F3K-92QX', passportId: 'BTU-AI-000125', version: 1, status: 'superseded',
    latestVersion: 2, issuedAt: ISSUED_AT, txHash: TX_HASH,
    // fields that the route must NOT pass on (the database function may return more than the API shows)
    docHash: 'aa'.repeat(32), versionId: 7,
  }],
  ['BTU-V-AAAA-2222', {
    verificationCode: 'BTU-V-AAAA-2222', passportId: 'BTU-AI-000125', version: 2, status: 'latest',
    latestVersion: 2, issuedAt: ISSUED_AT, txHash: TX_HASH, docHash: 'bb'.repeat(32), versionId: 8,
  }],
]);

const world = { lookups: [], logged: [], failLookup: null };
const app = createApp({
  verify: {
    async findVersionByCode(code) {
      world.lookups.push(code);
      if (world.failLookup) throw world.failLookup;
      return ledger.get(code) ?? null;
    },
  },
  logError: (...parts) => world.logged.push(parts.map(String).join(' ')),
});

// The chain info is not faked: the real code reads it from config (set above)
const server = await new Promise((resolve) => { const started = app.listen(0, '127.0.0.1', () => resolve(started)); });
const baseUrl = `http://127.0.0.1:${server.address().port}`;

async function call(path, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, headers: response.headers, text, json };
}

function assertError(result, status, code) {
  assert.equal(result.status, status, `status ${result.status}: ${result.text}`);
  assert.match(result.headers.get('content-type'), /application\/json/);
  assert.deepEqual(Object.keys(result.json), ['error']);
  assert.deepEqual(Object.keys(result.json.error).sort(), ['code', 'message']);
  assert.equal(result.json.error.code, code);
  assert.equal(typeof result.json.error.message, 'string');
}

// ---------- Scenarios ----------

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

await scenario('health check answers { ok: true }', async () => {
  const result = await call('/api/health');
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { ok: true });
});

await scenario('verify: an old version gives the facts of docs/api.md, with public chain data', async () => {
  const result = await call('/api/verify/BTU-V-7F3K-92QX');
  assert.equal(result.status, 200);
  assert.match(result.headers.get('content-type'), /application\/json/);
  assert.deepEqual(result.json, {
    verificationCode: 'BTU-V-7F3K-92QX',
    passportId: 'BTU-AI-000125',
    version: 1,
    status: 'superseded',
    latestVersion: 2,
    issuedAt: '2026-10-21T10:15:00.000Z',
    txHash: TX_HASH,
    chain: {
      chainId: 11155111,
      contractAddress: '0x7c90CbDcB0006819E5dfdfb8D36A74f0f3968509',
      rpcUrls: PUBLIC_RPC_URLS,
    },
  });
});

await scenario('verify: the latest version says latest', async () => {
  const result = await call('/api/verify/BTU-V-AAAA-2222');
  assert.equal(result.json.status, 'latest');
  assert.equal(result.json.version, result.json.latestVersion);
});

await scenario('verify: the server-only RPC list, hashes of documents and ids of rows never leave the server', async () => {
  const result = await call('/api/verify/BTU-V-7F3K-92QX');
  assert(!result.text.includes('SECRET-API-KEY'), 'the private RPC URL is in the answer');
  assert(!result.text.includes('aa'.repeat(32)), 'docHash is in the answer (the browser reads it from the contract)');
  assert(!('versionId' in result.json));
});

await scenario('verify: a lower case code with spaces is the same code', async () => {
  const result = await call('/api/verify/%20btu-v-7f3k-92qx%20');
  assert.equal(result.status, 200);
  assert.equal(result.json.verificationCode, 'BTU-V-7F3K-92QX');
  assert.equal(world.lookups.at(-1), 'BTU-V-7F3K-92QX');
});

await scenario('verify: a wrong format is 400 INVALID_CODE_FORMAT and the database is not asked', async () => {
  const before = world.lookups.length;
  for (const bad of ['abc', 'BTU-V-7F3K', 'BTU-V-7F3K-92QX-1', 'BTU-V-7F3K-92Q!', 'BTU-AI-000125', "'%3B%20DROP%20TABLE"]) {
    assertError(await call(`/api/verify/${bad}`), 400, 'INVALID_CODE_FORMAT');
  }
  assert.equal(world.lookups.length, before);
});

await scenario('verify: a well-formed code that was never issued is 404 CODE_NOT_FOUND', async () => {
  assertError(await call('/api/verify/BTU-V-ZZZZ-9999'), 404, 'CODE_NOT_FOUND');
});

await scenario('verify: a missing chain setup is a 500 with a generic text, and the cause is in the log', async () => {
  const saved = config.chain.publicRpcUrls;
  config.chain.publicRpcUrls = [];
  try {
    const result = await call('/api/verify/BTU-V-7F3K-92QX');
    assertError(result, 500, 'INTERNAL_ERROR');
    assert(!result.text.includes('PUBLIC_RPC_URLS'), 'the cause is shown to the caller');
    assert(world.logged.at(-1).includes('PUBLIC_RPC_URLS'), 'the cause is not logged');
  } finally {
    config.chain.publicRpcUrls = saved;
  }
});

await scenario('an unexpected error is 500 INTERNAL_ERROR: generic text for the caller, details only in the log', async () => {
  world.failLookup = new Error('connection to db.internal:5432 failed, password=hunter2');
  try {
    const result = await call('/api/verify/BTU-V-7F3K-92QX');
    assertError(result, 500, 'INTERNAL_ERROR');
    assert(!result.text.includes('hunter2') && !result.text.includes('db.internal'), 'details leaked to the caller');
    assert(world.logged.at(-1).includes('hunter2'), 'the error was not logged');
  } finally {
    world.failLookup = null;
  }
});

await scenario('an unknown path, an empty code and a wrong method are 404 NOT_FOUND in the same error shape', async () => {
  assertError(await call('/api/nothing-here'), 404, 'NOT_FOUND');
  assertError(await call('/api/verify/'), 404, 'NOT_FOUND');
  assertError(await call('/api/verify/BTU-V-7F3K-92QX', { method: 'POST' }), 404, 'NOT_FOUND');
  assertError(await call('/'), 404, 'NOT_FOUND');
});

await scenario('a body that is not valid JSON is 400 INVALID_REQUEST', async () => {
  const result = await call('/api/anything', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email": ' });
  assertError(result, 400, 'INVALID_REQUEST');
});

await scenario('a body that is too large is 400 INVALID_REQUEST', async () => {
  const body = JSON.stringify({ filler: 'x'.repeat(20_000) });
  assertError(await call('/api/anything', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }), 400, 'INVALID_REQUEST');
});

await scenario('CORS: only our own site may call the API from a browser', async () => {
  const own = await call('/api/health', { headers: { Origin: SITE_ORIGIN } });
  assert.equal(own.headers.get('access-control-allow-origin'), SITE_ORIGIN);

  const foreign = await call('/api/health', { headers: { Origin: 'https://evil.example' } });
  assert.notEqual(foreign.headers.get('access-control-allow-origin'), 'https://evil.example');
  assert.notEqual(foreign.headers.get('access-control-allow-origin'), '*');

  const preflight = await call('/api/student/passport', {
    method: 'OPTIONS',
    headers: { Origin: SITE_ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,x-admin-key' },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/i);
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-admin-key/i);
});

await scenario('the server does not say which framework it runs on', async () => {
  const result = await call('/api/health');
  assert.equal(result.headers.get('x-powered-by'), null);
});

server.close();
console.log(failed ? '\nSome scenarios FAILED.' : `\nAll ${step} scenarios passed.`);
process.exitCode = failed ? 1 : 0;
