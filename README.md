# BTU AI Skills Digital Passport

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
