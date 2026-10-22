# API and internal interfaces

The only place where the HTTP API and the interfaces between our parts are defined. Change it only after agreeing with each other.

Conventions:
- Base path `/api`. JSON in and out. Field names are `camelCase` and follow `server/sheets/reader.js` (`studentId`, `firstIssued`, `studentStatus`, `skillName`, `skillCategory`, …), so a field has one name from the Sheet to the browser. `server/db/queries.js` converts DB `snake_case` rows.
- `date` = `YYYY-MM-DD`. Timestamps = ISO 8601 UTC, e.g. `2026-10-21T10:15:00.000Z`.
- Status and result names come from `server/shared/constants.js` (`latest` / `superseded`, `AUTHENTIC_LATEST`, …).
- Every error has one shape: `{ "error": { "code": "CODE_NOT_FOUND", "message": "..." } }`. `code` is for programs, `message` is for people. Codes are listed at the end of Part 1.

---

# Part 1. HTTP API

## Public (no login)

### GET /api/verify/:code
Facts about one verification code. No personal data (no name, no email, no skills).
The page combines this answer with the contract read in the browser (see "Result logic" below).

`200`
```json
{
  "verificationCode": "BTU-V-7F3K-92QX",
  "passportId": "BTU-AI-000125",
  "version": 1,
  "status": "superseded",
  "latestVersion": 2,
  "issuedAt": "2026-10-21T10:15:00.000Z",
  "txHash": "0x3f1c…(64 hex)",
  "chain": {
    "chainId": 11155111,
    "contractAddress": "0x9a2B…",
    "rpcUrls": ["https://rpc-1.example", "https://rpc-2.example"]
  }
}
```
- `status`: `latest` or `superseded`. `latestVersion` is the newest version of the same passport.
- `chain` comes from `config.chain`: `chainId`, `contractAddress` and `rpcUrls` = `config.chain.publicRpcUrls` (`PUBLIC_RPC_URLS` in `server/.env`).
- `rpcUrls` is sent to the browser, so it must contain only public URLs without keys. Never send `RPC_URLS` (`config.chain.rpcUrls`): it is for the server only and may contain keys.
- Errors: `400 INVALID_CODE_FORMAT`, `404 CODE_NOT_FOUND`.

**Result logic (client).** `404` → `UNKNOWN_CODE`. With an uploaded PDF: its SHA-256 differs from the contract `docHash` → `MODIFIED`; equal and `status` is `latest` → `AUTHENTIC_LATEST`; equal and `superseded` → `AUTHENTIC_OUTDATED`. Without a PDF the page only shows that the record exists.

## Student (login with email OTP)

### POST /api/student/otp/request
Body: `{ "email": "student@example.org" }`
`200` `{ "ok": true }` — always, also for unknown emails (we do not reveal who is a student).
In dev the mail goes to Ethereal and the preview URL is printed to the server console (Decision 7).
Errors: `400 INVALID_REQUEST`.

### POST /api/student/otp/verify
Body: `{ "email": "student@example.org", "code": "482913" }`
`200`
```json
{ "token": "eyJhbGciOi…", "expiresIn": 7200 }
```
`expiresIn` is in seconds (2 hours). Send the token as `Authorization: Bearer <token>` to the endpoints below.
Errors: `400 INVALID_REQUEST`, `401 INVALID_OTP` (wrong code, unknown email, or no code requested), `401 OTP_EXPIRED` (10 minutes), `429 OTP_LOCKED` (5 wrong attempts).

### GET /api/student/passport
The logged-in student's own latest passport.

`200`
```json
{
  "passportId": "BTU-AI-000125",
  "firstName": "Giorgi",
  "lastName": "Kapanadze",
  "program": "Computer Science",
  "educationLevel": "Bachelor",
  "studentStatus": "Active",
  "firstIssued": "2026-10-01",
  "latest": {
    "version": 2,
    "verificationCode": "BTU-V-7F3K-92QX",
    "issuedAt": "2026-10-21T10:15:00.000Z",
    "txHash": "0x3f1c…(64 hex)"
  },
  "skills": [
    {
      "skillId": "SKL-001",
      "skillName": "Prompt Engineering",
      "skillCategory": "AI Skill",
      "stampCode": "BDG-AI-001",
      "skillDescription": "…",
      "earnedThrough": null,
      "dateEarned": "2026-09-12"
    }
  ]
}
```
- `skills`: all skills already issued to the student, oldest `dateEarned` first. `earnedThrough` is `null` for now: the Sheet has no such column (open question 1).
- Errors: `401 UNAUTHORIZED`, `404 PASSPORT_NOT_FOUND` (the student has no passport, or the first version is not issued yet).

### GET /api/student/passport/pdf
The PDF of the latest version. Response is `application/pdf` with `Content-Disposition: attachment; filename="BTU-AI-000125-v2.pdf"`.
The browser must download it with `HttpClient` as a blob (a plain link cannot send the `Authorization` header).
Errors: `401 UNAUTHORIZED`, `404 PASSPORT_NOT_FOUND`.

## Admin (header `X-Admin-Key: <ADMIN_API_KEY>`)
A separate header, so a browser that is also logged in as a student never mixes the two. Missing or wrong key → `401 UNAUTHORIZED` on every admin endpoint.

### GET /api/admin/passports
`200`
```json
{
  "items": [
    {
      "passportId": "BTU-AI-000125",
      "studentId": "BTU-T-0007",
      "firstName": "Giorgi",
      "lastName": "Kapanadze",
      "email": "giorgi@example.org",
      "latestVersion": 2,
      "skillCount": 5,
      "firstIssued": "2026-10-01",
      "lastIssuedAt": "2026-10-21T10:15:00.000Z"
    }
  ]
}
```
`latestVersion` and `lastIssuedAt` are `null` until the first version is issued. No paging (about 18 students).

### GET /api/admin/passports/:passportId/versions
Newest version first.

`200`
```json
{
  "passportId": "BTU-AI-000125",
  "versions": [
    {
      "version": 2,
      "verificationCode": "BTU-V-7F3K-92QX",
      "status": "latest",
      "issuedAt": "2026-10-21T10:15:00.000Z",
      "txHash": "0x3f1c…(64 hex)",
      "docHash": "9b74…(64 hex)"
    }
  ]
}
```
Errors: `404 PASSPORT_NOT_FOUND`.

### GET /api/admin/passports/:passportId/versions/:version/pdf
PDF of any version (needed to show demo scenario 12: an old version is authentic but outdated). Same response type as the student PDF.
Errors: `404 VERSION_NOT_FOUND`.

### GET /api/admin/sync-log
Newest first. Query: `level` (optional: `info`, `error`, `duplicate`), `limit` (optional, default 100, max 500).

`200`
```json
{
  "items": [
    {
      "id": 41,
      "sheetRow": 14,
      "recordId": null,
      "studentId": "BTU-T-9999",
      "level": "error",
      "message": "Row 14: unknown Student ID BTU-T-9999",
      "createdAt": "2026-10-21T10:15:00.000Z"
    }
  ]
}
```
Errors: `400 INVALID_REQUEST` (bad `level` or `limit`).

### POST /api/admin/sync
Starts a sync in the background (blockchain confirmations take too long for one HTTP request). No body.
`202` `{ "status": "started", "startedAt": "2026-10-21T10:15:00.000Z" }`
Errors: `409 SYNC_ALREADY_RUNNING`.

### GET /api/admin/sync/status
State of the current or last run. The admin page polls it until `running` is `false`, then reads `sync-log`.
It is kept in server memory and is lost on restart (enough for the MVP).

`200`
```json
{
  "running": false,
  "startedAt": "2026-10-21T10:15:00.000Z",
  "finishedAt": "2026-10-21T10:16:40.000Z",
  "summary": { "rowsRead": 60, "newAwards": 3, "versionsIssued": 2, "duplicates": 1, "errors": 1 },
  "error": null
}
```
Before the first run: `startedAt`, `finishedAt` and `summary` are `null`. If the whole run crashed, `error` holds a short message.

## Error codes

| HTTP | code | when |
|---|---|---|
| 400 | `INVALID_REQUEST` | missing or invalid body / query value |
| 400 | `INVALID_CODE_FORMAT` | verification code is not `BTU-V-XXXX-XXXX` |
| 401 | `UNAUTHORIZED` | missing, invalid or expired student token / admin key |
| 401 | `INVALID_OTP` | wrong code, unknown email, or no code requested |
| 401 | `OTP_EXPIRED` | the code is older than 10 minutes |
| 404 | `NOT_FOUND` | no such endpoint (wrong path or method) |
| 404 | `CODE_NOT_FOUND` | verification code is not in the ledger |
| 404 | `PASSPORT_NOT_FOUND` | no passport for this student / passport ID |
| 404 | `VERSION_NOT_FOUND` | passport has no such version |
| 409 | `SYNC_ALREADY_RUNNING` | a sync is already in progress |
| 429 | `OTP_LOCKED` | 5 wrong attempts for this code |
| 500 | `INTERNAL_ERROR` | anything unexpected; the message is generic, details go to the server log |

The codes live in `server/shared/constants.js` (`ERROR_CODE`).

---

# Part 2. Internal interfaces

Between `server/passport/` (Teammate) and `server/pdf/`, `server/chain/` (Giorgi). Objects are `camelCase`.

Hash rules (one for all):
- `codeHash`, `docHash` and `passportRef` are 64 lowercase hex characters with **no `0x`** (same as DB `doc_hash`). `chainService` adds `0x` for the contract and removes it again on the way back. `txHash` is `0x` + 64 hex (same as DB `tx_hash`).
- `codeHash` = SHA-256 of the verification code text (UTF-8, e.g. `BTU-V-7F3K-92QX`). `docHash` = SHA-256 of the final PDF bytes. The browser computes both with `crypto.subtle`, so it finds the same record the server wrote.
- `passportRef` = keccak256 of `passportId + PASSPORT_REF_SALT` (text, UTF-8), computed by the server, e.g. `ethers.id(passportId + salt)` without the `0x`. The chain stores only this hash, never the Passport ID. The salt is a secret from `server/.env`: it never leaves the server and must never change, otherwise old records can no longer be matched to their passport. The browser does not compute `passportRef`, it only reads it from the contract.
- The salt is `PASSPORT_REF_SALT` in `server/.env`, read as `config.passportRefSalt`.

## renderPassportPdf(student, awards, verificationCode) → Promise<Uint8Array>
`server/pdf/` (Giorgi). Called by `server/passport/` (Teammate). Async because `pdf-lib` is async.

Field names are the ones `server/sheets/reader.js` produces (`server/scripts/render-test.js` passes Sheet rows). DB rows from `server/db/queries.js` have the same names.
```js
student = { studentId: 'BTU-T-0007', firstName: 'Giorgi', lastName: 'Kapanadze', passportId: 'BTU-AI-000125', firstIssued: '2026-10-01' }

// every award of this student up to and including this version (the renderer sorts: dateEarned, then recordId)
awards = [
  { recordId: 'REC-0001', studentId: 'BTU-T-0007', skillId: 'SKL-001', skillName: 'Prompt Engineering', skillCategory: 'AI Skill', skillDescription: '…', dateEarned: '2026-09-12' }
]

verificationCode = 'BTU-V-7F3K-92QX'
```
- Returns the final PDF bytes. They are hashed and stored as they are; an issued PDF is never rendered again (hash would change).
- The stamp comes from `skillCategory` via `STAMP_CODE_BY_CATEGORY` (Decision 12).
- The QR encodes `${config.publicBaseUrl}/verify/${verificationCode}` (`PUBLIC_BASE_URL` in `server/.env`, default `http://localhost:4200`).

## chainService.issue(codeHash, docHash, passportRef, version) → Promise<{ txHash }>
`server/chain/` (Giorgi). Called by `server/passport/` (Teammate), step 4 of the issuance pipeline.
- `passportRef` ties the record to its passport without putting the Passport ID on chain (see hash rules).
- `version`: integer, 1 or more.
- Resolves **only after the transaction is confirmed** (1 confirmation, 120 s timeout). Throws if it reverts, times out or the RPC fails; the caller then keeps the previous `latest` (pipeline step 5).
- A timeout error ends with `txHash: 0x…`: the transaction may still be confirmed later. Before sending the same record again, the caller checks `getRecord(codeHash)`. If the record exists and its `docHash` matches, the issue worked and is not sent again.
- Called one student at a time, so nonces do not collide.

## chainService.getRecord(codeHash) → Promise<{ docHash, passportRef, version, timestamp, exists } | null>
`server/chain/` (Giorgi). Read-only.
- `docHash`, `passportRef`: 64 hex, no `0x`. `version`: number. `timestamp`: Unix seconds (block time). `exists`: `true` for a found record.
- `null` when this `codeHash` was never issued.
- The issuer address is not part of the record. The verify page reads the contract's issuer (set in the constructor, Decision 17) and compares it with `client/public/.well-known/btu-issuer.json`.
- The browser reads the same values directly from the contract through the public RPC.

## chainService.latestVersion(passportRef) → Promise<number>
`server/chain/` (Giorgi). Read-only. The highest version issued on chain for this passport, `0` if there is none.
Together with `getRecord` it answers "is this the latest version?" straight from the chain, without trusting the database.
