# BTU AI Skills Digital Passport

[![CI](https://github.com/secreta77/BTU-AI-PASSPORT-2.0/actions/workflows/ci.yml/badge.svg)](https://github.com/secreta77/BTU-AI-PASSPORT-2.0/actions/workflows/ci.yml)
![Lighthouse](https://img.shields.io/badge/Lighthouse-100-brightgreen)

## Overview
BTU adds verified AI skills to a Google Sheet. The system issues each student one permanent PDF passport, anchors its SHA-256 hash on the Sepolia blockchain, and lets anyone verify a passport without logging in. No personal data goes on chain, only hashes.

## Live demo
- Site: https://btu-ai-passport.netlify.app
- Registry contract (Sepolia): [`0x7c90CbDcB0006819E5dfdfb8D36A74f0f3968509`](https://sepolia.etherscan.io/address/0x7c90CbDcB0006819E5dfdfb8D36A74f0f3968509)

## Features
- Sync from Google Sheets by Record ID, with validation and write-back of the sync status
- PDF passport with stamps, verification code and QR
- One new version per student per sync, older versions are kept as `superseded`
- Public verification by code or by uploading the PDF (hash is computed in the browser and compared with the contract)
- Student login with email OTP, download of the latest passport, "Add to LinkedIn"
- Admin area: sync, sync log, students and passports
- Georgian and English UI

## Tech stack
- Backend: Node.js, Express
- Database: PostgreSQL, PDF storage on Supabase
- PDF: `pdf-lib`
- Blockchain: Solidity, Sepolia, `ethers` v6
- Frontend: Angular 21, SCSS, own UI library (`client/projects/ui`)
- Hosting: Render (API), Netlify (site)

## Quick start
Requires Node 24 for `client` and Node 22 for `server`.

```bash
# client (uses a mock API by default)
cd client
npm ci
npm start        # http://localhost:4200
npm test         # unit tests
```

```bash
# server
cd server
npm ci
cp .env.example .env   # fill in the values
npm run dev
npm test               # offline tests, no real database or blockchain needed
```

The database schema is in `server/db/schema.sql`.

## Docs
- [Technical overview](docs/technical-overview.md)
- [API](docs/api.md)
- [Demo scenarios](docs/demo-scenarios.md)

## Screenshots
Put images in [`docs/screenshots/`](docs/screenshots/).

---

## ქართული აღწერა

BTU ამატებს დადასტურებულ უნარებს Google Sheet-ში, სისტემა თითო სტუდენტს გასცემს PDF პასპორტს, მის ჰეშს ინახავს ბლოკჩეინზე (Sepolia), ხოლო ნებისმიერს შეუძლია პასპორტის გადამოწმება შესვლის გარეშე.

**ცოცხალი საიტი:** https://btu-ai-passport.netlify.app

## Flow
Google Sheets → sync → validate → PDF → SHA-256 → blockchain → DB ledger → write Q–T back to Sheet

## ტექნოლოგიები
- Backend: Node.js, Express
- ბაზა: PostgreSQL (Supabase), PDF-ების Storage
- Google Sheets API (Service Account)
- PDF: `pdf-lib`
- ბლოკჩეინი: Solidity, Sepolia, `ethers` v6
- Frontend: Angular 21, SCSS
- ჰოსტინგი: Render (API), Netlify (საიტი)

## დოკუმენტაცია
- [ტექნიკური მიმოხილვა](docs/technical-overview.md): არქიტექტურა, მონაცემთა გზა, ვერიფიკაცია, მასშტაბირება
- [API](docs/api.md)
- [დემო სცენარები](docs/demo-scenarios.md)

## Setup
1. `cd server && npm install`
2. Copy `server/.env.example` to `server/.env` and fill in the values
3. Run `server/db/schema.sql` on the PostgreSQL database (a NEW database). A database that already exists is updated with the files of `server/db/migrations/`, one by one in date order, in the Supabase SQL Editor, before the matching server version is deployed
4. `npm run dev`

## Structure
- `server/` backend (Express, PostgreSQL, pdf-lib, ethers)
- `contracts/` Solidity registry
- `server/scripts/` demo helpers (`tamper-pdf.js`, `check-sheet.js`)
- `client/` Angular app
- `docs/` task, demo scenarios, design

## Roles
See `CLAUDE.md`.
