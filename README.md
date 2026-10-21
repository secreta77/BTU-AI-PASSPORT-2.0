# BTU AI Skills Digital Passport

Hackathon MVP: BTU adds verified skills in Google Sheets, the system issues a PDF passport
per student, anchors its hash on a blockchain, and anyone can verify it without login.

## Flow
Google Sheets → sync → validate → PDF → SHA-256 → blockchain → DB ledger → write Q–T back to Sheet

## Setup
1. `cd server && npm install`
2. Copy `server/.env.example` to `server/.env` and fill in the values
3. Run `server/db/schema.sql` on the PostgreSQL database
4. `npm run dev`

## Structure
- `server/` backend (Express, PostgreSQL, pdf-lib, ethers)
- `contracts/` Solidity registry
- `scripts/` demo helpers (`tamper-pdf.js`)
- `client/` Angular app
- `docs/` task, demo scenarios, design

## Demo scenarios
See `docs/demo-scenarios.md`.

## Roles
See `CLAUDE.md`.
