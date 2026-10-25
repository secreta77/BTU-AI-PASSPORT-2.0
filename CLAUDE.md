# BTU AI Skills Digital Passport — Hackathon MVP

## Context
BTU hackathon: working MVP of the AI Skills Digital Passport.
Deadlines: mentor review Oct 26 11:00 · presentation Oct 28 17:00 · Demo Day Oct 30 (2026).
Jury checks 14 scenarios: `docs/demo-scenarios.md`. This file is the summary of the task — treat it as the source of truth.

## Token budget (Pro plan, shared weekly limit) — IMPORTANT
- Do NOT read `docs/task.md` in full (large, Georgian). Use this file; open task.md only with grep for a specific section when needed.
- Read `docs/design/` images and PDFs ONLY when working on UI or PDF layout, and only the page you need.
- Never scan the whole repo. Open only files relevant to the current step.
- Do not re-read files already read in this session unless they changed.
- Keep answers short. Show only changed parts of code in explanations, not whole files.
- Do not run long/expensive commands (full builds, installs) without asking.

## How to work with the team
- Reply in Georgian, short and simple. Technical terms, code and code comments in English.
- One small step at a time (1–3 files). For bigger tasks first list the steps and wait.
- Before writing code: explain the problem and approach, wait for approval. Always ask before changing existing code.
- Minimal, targeted changes. No broad rewrites.
- No new npm packages without approval and a reason.
- We are both learning (Angular comes from the STEP course), so explain step by step. After each step reply in this format, then STOP:
  1. რა გავაკეთე — 1–2 sentences
  2. ფაილები — created/changed
  3. როგორ მუშაობს — main idea in plain words
  4. როგორ შევამოწმო — exact command or action

## Code quality
**KISS:** readable for a beginner; no clever one-liners; functions do one thing, ~40 lines max; descriptive names (`findLatestVersion`); early returns; comments explain WHY. YAGNI: only what the task and demo scenarios need.
**DRY:** one piece of logic lives in one place; extract on real repetition, but do not force-merge code with different purposes. Single sources of truth:
- statuses (`latest`, `superseded`, `SYNCED`, `NOT SYNCED`, 4 verify results), badge codes, ID formats → `server/shared/constants.js` and `client/src/app/core/constants.ts` (no magic strings)
- models/types → `core/models/`
- PDF coordinates → only `server/pdf/layout.js`
- colors, spacing, breakpoints → only `projects/ui/src/styles/_variables.scss`, `_mixins.scss`
- API URLs → only `ApiService` + `environment.ts`
- validation → only `server/sheets/validator.js`
- one API error format `{ error: { code, message } }` via one error middleware
**Sensible optimization:**
- Read the Google Sheet once per sync (one call); write back Q–T with `batchUpdate`.
- Filter new records with one query (`WHERE record_id = ANY($1)`), not one query per row.
- Several new skills for one student in one sync = ONE new version (fewer PDFs and blockchain txs). Key scalability argument.
- Load PDF template, fonts, stamps into memory once (cache).
- Process students sequentially so blockchain nonces don't collide.
- Angular: lazy-load features; load `ethers` only in the verify feature; always `track` in `@for`.

## Stack
- Backend: Node.js + Express
- Sheets: `googleapis` + Service Account (key in `credentials/`, gitignored). Reader supports local xlsx too (same output shape).
- Database: **PostgreSQL** (organizers' requirement). Hosted on Supabase, but plain Postgres code: `pg` (node-postgres) + `DATABASE_URL`, standard SQL in `server/db/schema.sql`. Do not use Supabase JS client for DB.
- Storage: Supabase Storage for issued PDFs
- Student auth: own email OTP with `otp_codes` table
- PDF: `pdf-lib` + `@pdf-lib/fontkit` on `server/pdf/assets/template/Passport_Blank.pdf`
- Blockchain: Solidity `contracts/PassportRegistry.sol`, testnet (Sepolia or Polygon Amoy), `ethers` v6
- Frontend: Angular 21 in `client/`, SCSS
  - standalone components, new control flow (`@if`, `@for`)
  - zoneless (v21 default): put every async result (fetch, ethers, crypto.subtle) into a signal or the view won't update
  - state with signals; RxJS only at HttpClient level
  - simple reactive forms; NOT Signal Forms (experimental)
  - only Router, HttpClient, `studentGuard`, `authInterceptor`; NO NgRx, Tailwind, Angular Material or other external UI libraries (our own internal `client/projects/ui` library is not covered by this rule)
  - routes: `/verify`, `/verify/:code` (QR target), `/login`, `/my-passport` (guard), `/admin`

## Frontend architecture: core / features + UI library (mandatory)
```
client/src/app/
├── core/      services (providedIn root), guards, interceptors, models, constants, i18n, layout (header/footer)
└── features/  verify/, student/, admin/ — each lazy-loaded
client/projects/ui/   reusable UI library, imported as `@btu/ui` (path alias, no separate build)
├── src/lib/      components (selector prefix `ui-`)
├── src/styles/   _variables.scss, _mixins.scss, _base.scss, _components.scss (SCSS tokens, found by `includePaths` in angular.json)
└── src/public-api.ts   every export
```
Dependencies: features → core, `@btu/ui`. Features never import each other. Before creating a file, say which layer and why.
**UI library rule:** UI used twice → `projects/ui`. The library never imports app code (no services, no `core/`, no HTTP, no `LanguageService`/`t` pipe); all texts come in through `input()` and the page passes translated strings. A `shared/` folder inside the app exists only if app-specific helpers (pipes, directives) appear; reusable components do not go there. New library components: standalone, OnPush, signals, a11y, exported in `public-api.ts`, with a small spec and a line in `projects/ui/README.md`.

## Styling rules (mandatory)
- Mobile-first; larger screens via `min-width` mixins (480, 768, 1024, 1280px only from `_mixins.scss`).
- Must not break at 320px: no horizontal scroll, no overflowing text, buttons visible. Check 320/375/768/1024/1440.
- No fixed px widths on containers: `width: 100%` + `max-width`; images `max-width: 100%`.
- Long values (hashes, codes) and tables: `overflow-x: auto` wrapper or `word-break: break-all`.
- Units: rem for spacing and font-size; px only for borders/1–2px details.
- margin/padding never above `4rem`; spacing scale: 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4rem. No large rem values (5rem+), also for gaps/heights.
- Font sizes: body 0.875–1.125rem, headings max 2.5rem (`clamp(1.5rem, 4vw, 2.5rem)`).
- Layout only with flexbox/grid. `position: absolute/fixed/sticky` only where unavoidable (modal, dropdown, tooltip, sticky header, badge) with a comment why. Never for alignment/spacing.
- No `!important`, no inline styles. Prefer CSS-only solutions.
- Shared UI classes (`.button`, `.notice`, `.card`) live only in `projects/ui/src/styles/_components.scss` (global). Never copy them into a component's SCSS; page-specific parts (e.g. `.card__head`) stay in the page.
- Colors/fonts/spacing only from SCSS variables. BTU palette: orange #FF6B00, dark #2B2B2B, light gray cards, stamp colors (red, purple, navy, green, pink).

## Frontend quality standards (mandatory for all new code)
1. **Shared UI library:** reusable components and design tokens live in an Angular library (`client/projects/ui`), imported via a path alias. Any UI used twice goes there. Build it for future reuse (no BTU-specific logic, no HTTP).
2. **Requests:** buttons are disabled while a request is pending; submits use `exhaustMap` (no duplicate requests); resend actions (e.g. OTP) have a cooldown (e.g. 60s); GET results are cached where safe (`shareReplay` or a service-level signal cache); `switchMap` for changing inputs.
3. **Loading:** skeleton placeholders instead of plain "loading" text.
4. **Accessibility:** semantic HTML, every input has a label, `aria-live="polite"` for status changes, visible focus, keyboard navigation, alt text for images, WCAG AA contrast.
5. **Performance:** `ChangeDetectionStrategy.OnPush` everywhere, `@defer` for heavy parts, `NgOptimizedImage` for images, no impure pipes, `track` in every `@for`. Target Lighthouse Performance and Accessibility 90+.
6. **Signals first:** state with `signal`/`computed`, `toSignal` for observables, `input()`/`output()`/`model()`; avoid manual `subscribe`.
7. Existing pages will be updated in a separate "quality pass"; all new code follows these rules from now.

## System flow
Google Sheets (BTU adds verified skills) → sync by Record ID → validate → find student/passport → generate PDF → SHA-256 → anchor on chain → mark version latest → write Q–T back to Sheet.

## Issuance pipeline — keep this order
1. Generate Verification Code (e.g. `BTU-V-7F3K-92QX`), different from Passport ID.
2. Render PDF with the code + QR.
3. SHA-256 of the final PDF bytes.
4. Upload the PDF to Storage (before the chain) as `{passportId}/v{version}-{code}.pdf`, never overwriting (`upsert: false`).
5. `issue(codeHash, docHash, passportRef, version)` on the contract from the BTU issuer wallet.
6. Only after tx confirmation, in one DB transaction: new version = `latest` (with `pdf_path` and `tx_hash`), previous = `superseded`. On failure the previous latest stays.
7. Write Q–T in the Sheet: SYNCED / version / time / error.

Retry safety: if the chain step fails, the uploaded PDF stays in Storage (never deleted). On retry the same code and the same PDF are reused, never rendered again (the hash would change), and `getRecord(codeHash)` is checked before `issue()` is sent again (Decision 25).

## Critical rules
- Idempotency: `record_id` UNIQUE; a record is never processed twice.
- One student = one permanent Passport ID (`BTU-AI-000NNN`); new students get one from the system, written to all their Sheet rows.
- Name, surname, Passport ID, first issue date never change. Earlier skills are never removed.
- Unknown Student ID or incomplete row (A–M, O–Q required) → stop, log to `sync_log` and column T.
- If a status column exists, only `CONFIRMED` goes into the passport; `PENDING`/`REJECTED` ignored.
- No personal data on chain — hashes only.
- Secrets (wallet key, Google credentials, `DATABASE_URL`, Supabase keys) only in `.env` (gitignored); `.env.example` with empty values.
- Never trust Sheet status for verification; source of truth = DB ledger + blockchain.

## PostgreSQL rules
- Uniqueness in DB: `skill_awards.record_id`, `passports.student_id`, `passport_versions.verification_code`, `(passport_id, version)`.
- Only one `latest` per passport: partial unique index `WHERE status = 'latest'`.
- Switching latest/superseded happens in one transaction (`BEGIN … COMMIT`, `ROLLBACK` on error).
- Parameterized queries only (`$1, $2`). No string-built SQL.
- `timestamptz` (UTC); indexes on `student_id`, `passport_id`, `verification_code`.
- Old versions and `sync_log` are never deleted.

## Public verification (no login)
- Enter code → record exists? issuer = BTU? latest or not?
- Upload PDF → hash in browser (`crypto.subtle`), compared with the contract read directly from the browser via public RPC.
- 4 results: ✅ authentic + latest / 🟡 authentic, outdated / ❌ modified / ❓ unknown code. "Record exists" and "this file is authentic" shown separately.
- Show no personal data beyond what verification needs.
- Issuer identity: only the BTU wallet can write to the contract; its address is published in `client/public/.well-known/btu-issuer.json` (did:web style); verification compares both.

## PDF template (Passport_Blank.pdf)
- 4 pages, A4 landscape (841.89 × 595.28 pt), no form fields — draw by coordinates.
- p1: NAME, SURNAME, DATE, PASSPORT ID · p2: static · p3: 10 stamp slots (2×5), duplicate page if >10 · p4: table with 5 rows (Stamp Type, Skill, Description, Earned Through, Date Earned), duplicate page if >5 (test data max is 6).
- pdf-lib has no text wrapping → `textWrap.js`.
- No place for Verification Code/QR in the template → page 1, in the empty space under SURNAME (QR on the left, `VERIFICATION CODE:` text next to it). QR link: `{PUBLIC_BASE_URL}/verify/{code}`.
- Font Gilroy (commercial) → temporary Google Font until BTU provides it.
- Stamps: BDG-AI-001 = AI Skill (red triangle), BDG-AI-002 = AI Applied Skill (purple), BDG-AI-003 = AI Advanced Skill (navy circle).
- Visual reference: `docs/design/filled-page-1..4.png`, `blank-page-1..4.png`.

## Test data (`docs/test-data.xlsx`)
- Sheet "Passport Skill Records": 60 records, 18 students, 16 skills (SKL-001…016).
- Header row is found by "Student ID" in the first cell (row 4 today); Technical Notes block at the bottom must be skipped.
- A–P: BTU input. Q–T: system-managed (Sync Status, Version, Synced At, Error).

## Open questions (organizers)
1. "Earned Through" data is missing in the Excel.
2. docx mentions 3 sheets + CONFIRMED status; Excel has 1 sheet without status.
3. Verification Code/QR placement (page 1, under SURNAME) — our proposal, confirm with BTU.
4. Gilroy font files and stamps as SVG.
5. "SYNCED" rows have no real blockchain proof — re-issue V1 for everyone on first run?

## Roles
- Giorgi: `server/pdf/`, `contracts/`, `server/chain/`, `client/` (Angular), `server/scripts/tamper-pdf.js`
- Teammate: `server/db/`, `server/sheets/`, `server/sync/`, `server/passport/`, `server/storage/`, `server/auth/`, `server/routes/`, `docs/api.md`
- Shared interfaces: `renderPassportPdf(student, awards, verificationCode)` → bytes (target contract; `verificationCode` is added in the QR step); `chainService.issue(codeHash, docHash, passportRef, version)` → txHash; API shapes in `docs/api.md`.

## Decisions
1. New vs invalid student:
   - New: Student ID not in DB + Passport ID cell empty + name/surname/email present → create passport.
   - Error (stop, log to `sync_log` and column T): Student ID format is not `BTU-T-NNNN`; known Student ID but name or email differs from DB; Passport ID filled but unknown or belongs to another student.
2. Bootstrap (first run only): import existing Passport IDs and First Issued dates from the sheet as-is, issue a fresh V1 on chain for each student.
3. Demo scenarios 7 and 8 are two aspects of one sync (one new version per student per sync).
4. Blockchain reads: config with 2–3 public RPC URLs and fallback; the verify page shows an Etherscan tx link.
5. `server/scripts/tamper-pdf.js` belongs to the Blockchain role.
6. Admin API: protected by `ADMIN_API_KEY`. Student session: JWT in `Authorization` header, expires in 2 hours.
7. OTP: valid 10 minutes, max 5 attempts. Test emails are on example.org and receive nothing, so in dev nodemailer uses an Ethereal test account and the preview URL is printed to the server console (empty `SMTP_*` = Ethereal). Real mail: with `BREVO_API_KEY` + `MAIL_FROM` set, the code goes through the Brevo HTTPS API (hosts such as Render free block SMTP ports). Order of use: Brevo, SMTP, Ethereal.
8. Excel reading uses `exceljs` (not `xlsx`, which is outdated with security issues).
9. Never write package versions from memory. Install new packages with `npm install <name>` so npm picks the current version.
10. Duplicates: sync filters by `student_id` + `skill_id` before INSERT. Errors and duplicates go to `sync_log` with `INSERT ... ON CONFLICT DO NOTHING` (unique index on `record_id, message` where level is not `info`), so each is logged once.
11. Student updates: sync updates `program`, `education_level`, `status`. `student_id`, name, surname, email never change (mismatch = error, §1). A `status` change alone does not create a new version.
12. Category → stamp code mapping lives only in `constants.js` (not in the DB).
13. Error/duplicate `sync_log` messages always contain the Sheet row number, e.g. "Row 14: missing Record ID". Rows without `record_id` are told apart by this.
14. Git commits: never add `Co-Authored-By` or "Generated with Claude Code" lines. Commit message = short English description only.
15. Git workflow: never commit to main directly. One feature branch per task (`feature/<name>`), start from up-to-date main, push the branch, merge via GitHub Pull Request.
16. `server/config.js` is the only place that reads `.env` (loaded by the server folder, so scripts run from any directory). It does not fail on empty values: the module that needs a value checks it itself. Teammates only import `config`, they do not change the file.
17. Contract: constructor(address issuer); only issuer can write. Giorgi deploys via Remix from any wallet; the issuer address belongs to Teammate (private key only in Teammate's server/.env). Verify page compares contract issuer with client/public/.well-known/btu-issuer.json.
18. Sheet rows: column N (stamp code) is a formula, the reader takes its result; dates are text `YYYY-MM-DD`. Passport ID and First Issued are empty for new students, so the validator only checks their format when filled. Empty rows are skipped, reading stops at "TECHNICAL NOTES"; any other row without a valid Record ID is an error (scenario 6).
19. DB: needs PostgreSQL 15+ (`NULLS NOT DISTINCT`). `students.student_id` and `passports.passport_id` are text primary keys. Bootstrap must `setval('passport_number_seq')` to the highest imported number. `skill_awards.version_id` NULL = skill not issued in a passport yet.
20. PDF rendering: dates are `DD.MM.YYYY` (`shared/format.js`); skills sorted oldest first by `dateEarned`, then `recordId`; `layout.js` values are written in design-PNG pixels and converted to points (page 4 was measured on the real `Passport_Blank.pdf`, the PNG differs slightly). Extra pages are added for >10 stamps / >5 table rows. Text shrinks down to 7pt in table cells, then `console.warn`. Helvetica is temporary. Skill objects passed to the renderer must keep `studentId` (used in warnings).
21. `PUBLIC_BASE_URL` defaults to `http://localhost:4200`; the QR link is `{PUBLIC_BASE_URL}/verify/{code}`.
22. Contract design: `issue(codeHash, docHash, passportRef, version)`. One `codeHash` can be written only once. `version` must be exactly `latestVersion[passportRef] + 1`, and `latestVersion` is updated on every issue (read it with `latestVersion(passportRef)`; 0 = none). `docHash` and `passportRef` must not be zero. `issuer` is `public immutable`. `passportRef = keccak256(passportId + PASSPORT_REF_SALT)`, computed by the server; no personal data on chain.
23. RPC config: `RPC_URLS` is for the server (may contain an API key). `PUBLIC_RPC_URLS` is for the browser, public URLs only, never a key.
24. Hash format: `codeHash` and `docHash` are SHA-256 hex without `0x`. The contract takes `bytes32`, so `chainService` converts (`'0x' + hex`) on the way in and strips it on the way out. `chainService` is the next step.
25. Retry safety: before re-sending issue(), pipeline calls getRecord(codeHash). If the record exists with the same docHash, treat it as success (tx already landed) and do not resend.
26. `chainService` accepts codeHash, docHash and passportRef with or without 0x and normalizes them in one helper (normalizeBytes32). passportRef = ethers.id(passportId + config.passportRefSalt).
27. Browser gets publicRpcUrls and contractAddress from the verify API response (docs/api.md), not from environment.ts.
28. UI text only via `core/i18n` (ka default, en). PDF passport stays English. Components never contain literal text: use `{{ 'key' | t }}`. Add a key to `ka.ts` first; `en.ts` is type-checked against it. Georgian style: natural, simple Georgian (not word-for-word translation), short sentences, formal "თქვენ" address. Glossary (use the same term everywhere): Verify → გადამოწმება | Verification code → ვერიფიკაციის კოდი | Passport → პასპორტი | Skill → უნარი | Stamp → შტამპი | AI Skill → AI უნარი | AI Applied Skill → AI გამოყენებითი უნარი | AI Advanced Skill → AI სიღრმისეული უნარი (skill names and descriptions come from BTU data and stay English, marked `lang="en"`) | Issued → გაცემულია | Latest version → უახლესი ვერსია | Outdated → მოძველებული | Log in → შესვლა | Admin → ადმინისტრირება | Coming soon → მალე დაემატება | Sync → სინქრონიზაცია | Log → ჟურნალი. Browser `<title>` stays "BTU AI Passport".
29. Pipeline order (Storage before chain): the PDF is uploaded after the hash and before `issue()`, so a confirmed chain record never lacks its PDF. Path: `{passportId}/v{version}-{code}.pdf` in the private bucket, uploaded with `upsert: false` (same bytes again = success, different bytes = error). A failed chain call leaves the file in Storage; the next attempt for the same version finds it (`findStoredPdf`) and reuses its code and bytes. Exception: if an award arrived after that file was created, the file does not contain it, so a new code and PDF are made for all pending awards (the old file stays unused). If the old code is already on chain but not in the DB, the pipeline stops with a clear error instead of guessing.
30. Client ABI: `client/src/app/core/chain/passport-registry.abi.ts` is a copy of the 3 view functions (`getRecord`, `latestVersion`, `issuer`) from `server/chain/abi.json`. When the contract changes, update both files together. `ethers` is loaded only with a dynamic import in `ChainVerifyService`, so it is a separate lazy chunk. Mock mode skips the chain block and compares the file with `MOCK_DOC_HASHES` (SHA-256 of `Passport_Blank.pdf`).
31. Netlify `[[headers]]` path `/x/*` also matches `/x` itself (no code part needed). Never use `/verify/*` for noindex: it would block the public `/verify` page (Lighthouse "blocked from indexing"). Code pages `/verify/:code` use meta robots noindex from `SeoService`; their HTML is only the SPA shell, no personal data.
