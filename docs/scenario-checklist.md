# 14 სცენარის შემოწმება (2026-10-25)

წყარო: `docs/demo-scenarios.md` და მიმდინარე კოდი (`main`, PR #39-ის შემდეგ). ეს არის **კოდის წაკითხვის ანალიზი**, ცოცხალი სრული გაშვება არ ჩატარებულა. ერთადერთი ცოცხალი შემოწმება: `https://btu-ai-passport.netlify.app/verify` იხსნება (200), `/api/verify/<უცნობი კოდი>` სწორ `CODE_NOT_FOUND` პასუხს აბრუნებს, ანუ API და DB Render-ზე მუშაობს.

სტატუსი: ✅ მუშაობს · ⚠️ ნაწილობრივ · ❌ აკლია. Sync-ზე დამოკიდებულ სცენარებში ⚠️ ნიშნავს: კოდი მზადაა, მაგრამ Render-ზე sync ვარდება (იხ. ღია საკითხები), ამიტომ ცოცხლად ვერ ვაჩვენებთ, სანამ არ გასწორდება.

| # | სცენარი | სტატუსი | სად არის კოდში | როგორ ვაჩვენოთ დემოზე | ვისი საქმეა | რა აკლია |
|---|---|---|---|---|---|---|
| 1 | ახალი სტუდენტის დამატება | ⚠️ | `server/sync/rowPlanner.js` (Decision 1), `server/sync/syncService.js`, `server/db/schema.sql` (`passport_number_seq`) | Sheet-ში ახალი Student ID, Passport ID ცარიელი → [/admin](https://btu-ai-passport.netlify.app/admin) → "სინქრონიზაცია" → სიაში ჩნდება `BTU-AI-000NNN` | Luka | Render-ზე sync უნდა მუშაობდეს |
| 2 | პასპორტის პირველადი გენერაცია | ⚠️ | `server/pdf/renderer.js`, `layout.js`, `textWrap.js`, `server/passport/issuePipeline.js` | [/admin](https://btu-ai-passport.netlify.app/admin) → პასპორტი → ვერსია → PDF-ის ჩამოტვირთვა | Giorgi (PDF), Luka (pipeline) | შრიფტი Helvetica (Gilroy არ არის). "Earned Through" ყველგან `—` (placeholder). QR/კოდის ადგილი BTU-სთან დასადასტურებელია |
| 3 | ახალი უნარი Sheet-ში | ⚠️ | `server/sheets/reader.js`, `validator.js`, `server/sync/syncService.js` | Sheet-ში ახალი სტრიქონი → [/admin](https://btu-ai-passport.netlify.app/admin) → "სინქრონიზაცია" → ჟურნალში ჩანს დამუშავება | Luka | იგივე: Render-ზე sync (Google credentials ბილიკი) |
| 4 | ახალი უნარის ასახვა | ⚠️ | `server/sync/syncService.js`, `server/passport/issuePipeline.js`, `server/db/queries.js` | იგივე, რაც 3; შემდეგ [/my-passport](https://btu-ai-passport.netlify.app/my-passport) ან ადმინში ახალი ვერსია | Luka | Render-ზე sync |
| 5 | განმეორებითი sync | ⚠️ | `server/sync/rowPlanner.js` (`recordIds`, `alreadySyncedCount`), `record_id UNIQUE` | [/admin](https://btu-ai-passport.netlify.app/admin) → sync ორჯერ → მეორეზე "უკვე სინქრონიზებულია", ახალი ვერსია არ იქმნება | Luka | Render-ზე sync |
| 6 | არასწორი Student ID | ⚠️ | `server/sheets/validator.js`, `rowPlanner.js` (Decision 1, 13), `sync_log`, Sheet column T | Sheet-ში `BTU-T-9999` → sync → [/admin](https://btu-ai-passport.netlify.app/admin) ჟურნალში "Row N: ..." შეცდომა | Luka | Render-ზე sync |
| 7 | პასპორტის განახლება | ⚠️ | `server/passport/issuePipeline.js`, `passportService.js`; `server/db/queries.js` | სცენარი 4-ის შემდეგ ადმინში ორივე ვერსია, Passport ID და პირველი თარიღი ერთია | Luka | Render-ზე sync |
| 8 | ახალი ვერსიის გამოცემა | ⚠️ | `server/passport/issuePipeline.js`, `server/chain/chainService.js`, `contracts/PassportRegistry.sol` | ადმინი → პასპორტი → ვერსიები: V2 `latest`, V1 `superseded`, ჩანს tx hash (Etherscan ბმული) | Luka (pipeline), Giorgi (chain) | Render-ზე sync. Bootstrap (Open question 5) არ უნდა დაგვრჩეს გაუშვებელი |
| 9 | უცვლელი PDF | ✅ | `client/src/app/features/verify/verify-page.*`, `core/services/chain-verify.service.ts`, `core/chain/passport-registry.abi.ts` | [/verify](https://btu-ai-passport.netlify.app/verify) → კოდი + ორიგინალი PDF → ✅ | Giorgi | ცოცხალი გამეორება საბოლოო PDF-ზე |
| 10 | შეცვლილი PDF | ✅ | `server/scripts/tamper-pdf.js` (`npm run tamper`), verify გვერდი | `npm run tamper -- <pdf>` → [/verify](https://btu-ai-passport.netlify.app/verify) → ყალბი ფაილი → ❌ "ფაილი შეცვლილია" | Giorgi | ცოცხალი გამეორება რეალურ გაცემულ PDF-ზე (`output/test.pdf` სატესტოა) |
| 11 | გამცემის იდენტობა | ✅ | `client/public/.well-known/btu-issuer.json`, `chain-verify.service.ts` (`issuerMatches`), `contracts/PassportRegistry.sol` (`issuer` immutable) | [/verify/<კოდი>](https://btu-ai-passport.netlify.app/verify) → ჩანს "გამცემი = BTU" ✅ | Giorgi | json-ში მისამართი უნდა ემთხვეოდეს რეალურ issuer wallet-ს (ერთხელ ცოცხლად შევამოწმოთ) |
| 12 | ძველი ვერსია | ✅ | `chain-verify.service.ts`, verify გვერდი (🟡), API `latestVersion` (`server/routes/verifyRoutes.js`) | [/verify](https://btu-ai-passport.netlify.app/verify) → V1-ის კოდი + V1 PDF → 🟡 "ავთენტურია, მოძველებული" | Giorgi | მოითხოვს, რომ ერთ სტუდენტს ორი ვერსია ჰქონდეს (სცენარი 8) |
| 13 | სტუდენტის წვდომა | ✅ | `server/auth/otpService.js`, `server/routes/studentRoutes.js`, `client/.../student/*`, `studentGuard` | [/login](https://btu-ai-passport.netlify.app/login) → email OTP → [/my-passport](https://btu-ai-passport.netlify.app/my-passport) → PDF ჩამოტვირთვა | Giorgi (UI), Luka (auth) | ტესტ-email-ები example.org-ზეა და არაფერს იღებს. რეალური წერილისთვის `BREVO_API_KEY` + `MAIL_FROM` უნდა იყოს Render-ზე, ან დემოზე ჩვენი email გამოვიყენოთ |
| 14 | საჯარო ვერიფიკაცია | ✅ | `server/routes/verifyRoutes.js`, `client/.../verify/*`, მთავარი გვერდი `/verify` | [/verify](https://btu-ai-passport.netlify.app/verify) ლოგინის გარეშე; QR → `/verify/<კოდი>` | Giorgi | არაფერი. API ცოცხალია (შემოწმებულია) |

## ცნობილი ღია საკითხები

1. **Sync Render-ზე ვარდება** (Luka). `server/sheets/googleClient.js` კითხულობს service account ფაილს `GOOGLE_CREDENTIALS_PATH`-ით, რომელიც `credentials/`-შია და gitignored. Render-ზე ეს ფაილი არ არსებობს. გამოსავალი: credentials JSON გარემოს ცვლადში (ან Render Secret File) და `googleClient.js`-ში ორივეს მხარდაჭერა. ეს ბლოკავს სცენარებს 1, 3–8 ცოცხალ დემოზე.
2. **`POST /api/admin/awards`** (Luka). კონტრაქტი არის `docs/api.md`-ში, ადმინის ფორმა კლიენტში უკვე შერწყმულია (`admin-award-form.*`, PR #38), მაგრამ `server/routes/adminRoutes.js`-ში მხოლოდ GET მარშრუტებია. ფორმის გაგზავნა ახლა 404-ს დააბრუნებს. აუცილებელი სცენარი არ არის, მაგრამ ქმნის სარეზერვო გზას, თუ Sheet-ი არ იმუშავებს.
3. **"Earned Through" Sheet-ში არ არის.** PDF-ის გვერდი 4-ზე `—` იწერება (`EARNED_THROUGH_PLACEHOLDER`, `server/pdf/renderer.js`). საჭიროა BTU-ს პასუხი (Open question 1) ან დემოზე ბოლოს ვიტყვით, რომ ველი მოსალოდნელია.
4. **Gilroy შრიფტი.** ჯერ Helvetica (Decision 20). BTU-ს ფაილები არ მოუციათ. PDF სწორად მუშაობს, ვიზუალური სხვაობა მცირეა.

## პრიორიტეტული სია feature freeze-მდე (27 ოქტომბერი, 18:00)

| პრიორიტეტი | რა | ვისი ხელით |
|---|---|---|
| 1 | Google credentials Render-ზე და sync-ის ცოცხალი გაშვება (ბლოკავს 8 სცენარს) | Luka |
| 2 | სრული მარშრუტის გავლა ცოცხლად: ახალი სტუდენტი → PDF → ახალი უნარი → V2 → V1-ის 🟡. ერთი სტუდენტი ორი ვერსიით აუცილებელია სცენარებისთვის 8, 12 | Luka + Giorgi |
| 3 | `btu-issuer.json`-ის მისამართის შედარება ცოცხალ კონტრაქტთან და სცენარი 11-ის გავლა | Giorgi |
| 4 | სცენარი 10: `npm run tamper` რეალურად გაცემულ PDF-ზე, ორიგინალი ✅, ყალბი ❌ | Giorgi |
| 5 | სცენარი 13: რეალური OTP წერილი (`BREVO_API_KEY` Render-ზე) ან დემოსთვის ჩვენი email | Luka |
| 6 | `POST /api/admin/awards` სერვერზე (სარეზერვო გზა და კლიენტის ფორმის ამუშავება) | Luka |
| 7 | **სტუდენტისთვის წერილი** ახალი ვერსიის გაცემისას (Brevo უკვე მუშაობს). წერილის წარუმატებლობამ გაცემა არ უნდა შეაჩეროს: შეცდომა ჟურნალში იწერება, pipeline გრძელდება | Luka |
| 8 | **ავტომატური sync სერვერის შიგნით**, ყოველ 30 წუთში (პრიორიტეტი 1-ის შემდეგ). Google გასაღები სერვერიდან არ გადის, ერთდროული გაშვებისგან იცავს არსებული 409 | Luka |
| 9 | დემოს რეპეტიცია 14 სცენარზე, `demo-scenarios.md`-ის სტატუსების განახლება | ორივე |
| 10 | მოხერხებისამებრ: Gilroy და "Earned Through" (დამოკიდებულია BTU-ზე), UI quality pass | Giorgi |

**სარეზერვო გეგმა:** თუ Render-ზე sync 27-ის 12:00-მდე არ გასწორდა, სცენარები 1–8 ვაჩვენოთ ლოკალურად (`npm run sync`, იგივე DB და ჯაჭვი), ხოლო 9–14 ცოცხალ საიტზე.

## მოთხოვნის მიღმა (`docs/task.md`-ის მიხედვით)

წყარო: task.md-ის გამიზნული გადამოწმება (grep). Task.md-ში ორი ჯგუფია: სავალდებულო მოთხოვნები და ცალკე ბლოკი "დამატებითი ფუნქციონალი" (არასავალდებულო, გუნდის გადაწყვეტილებით). ქვემოთ ვყოფთ: **A** = არასავალდებულო, მაგრამ task.md-ში დასახელებული; **B** = სავალდებულოს ჩვენეული რეალიზაცია; **C** = task.md-ში საერთოდ არ არის, ჩვენი დამატებაა.

| ფუნქცია | ჯგუფი | რას ამბობს task.md | რატომ არის სასარგებლო |
|---|---|---|---|
| QR კოდი PDF-ზე | A | "დამატებითი ფუნქციონალი": QR, რომელიც პირდაპირ ვერიფიკაციის გვერდზე გადაიყვანს. სავალდებულოა მხოლოდ უნიკალური Verification Code/ID | დამსაქმებელს კოდის ხელით აკრეფა არ სჭირდება: სკანირება და `/verify/<კოდი>` იხსნება. ბეჭდურ ვერსიაზეც მუშაობს |
| PDF-ის ატვირთვა და შემოწმება | B | სავალდებულოა კონკრეტული PDF-ის კრიპტოგრაფიული შემოწმება, "მაგალითად PDF ფაილის ატვირთვით" | მხოლოდ კოდის შემოწმება ფაილის ნამდვილობას არ ადასტურებს. ატვირთვა აჩვენებს ❌ შეცვლილ ფაილზე (სცენარი 10) |
| ჰეშის დათვლა ბრაუზერში (`crypto.subtle`) | B | ჰეშის გამოყენება შემოთავაზებულია ("ერთ-ერთი შესაძლო მიდგომა"). ადგილი (ბრაუზერი/სერვერი) არ არის დაზუსტებული | სტუდენტის პასპორტი (პერსონალური მონაცემები) სერვერზე არ იგზავნება. ასევე სერვერს არ ვენდობით შედეგში |
| ბლოკჩეინის დამოუკიდებელი წაკითხვა ბრაუზერიდან (public RPC) | B | სავალდებულოა ბლოკჩეინ-ვერიფიკაცია. საბოლოო მიზანი: მესამე მხარე "დამოუკიდებლად გადაამოწმებს". პირდაპირ ბრაუზერიდან კითხვა არ არის მოთხოვნილი | ჩვენს სერვერს (DB-ს) ნდობა არ სჭირდება: შედეგს სახელმწიფო ჯაჭვი ადასტურებს. თუ ჩვენი API გაითიშოს, ჯაჭვი მაინც იკითხება. Etherscan ბმული ამას თვალსაჩინოს ხდის |
| ორი ენა (ka/en) | C | ენებზე მოთხოვნა არ არის | დემოს აუდიტორია სხვადასხვაა (ჟიური, დამსაქმებლები, საერთაშორისო სტუმრები). PDF ინგლისურია, UI ორენოვანია |
| ხელმისაწვდომობა და Lighthouse | C | მოთხოვნა არ არის | ხელმისაწვდომი საჯარო გვერდი ყველას ემსახურება (კლავიატურა, screen reader). გაზომილია (Giorgi, 25.10.2026, `https://btu-ai-passport.netlify.app/verify`, mobile): Performance 100, Accessibility 100, Best Practices 100, SEO 100 |
| UI ბიბლიოთეკა (`client/projects/ui`) | C | მოთხოვნა არ არის | ერთი ადგილი სტილებისთვის და კომპონენტებისთვის (skeleton, badge, file drop). უფრო ადვილია ერთგვაროვნების დაცვა. მომავალში სხვა BTU პროექტებშიც გამოიყენება |
| ხელით უნარის დამატება (ადმინის ფორმა) | C | Google Sheets არის "ძირითადი" წყარო. ხელით დამატება არ არის ნახსენები | სარეზერვო გზა, თუ Sheet/Render გაფუჭდა დემოზე. **სერვერის მხარე ჯერ არ არის** (ღია საკითხი 2) |
| წყაროს ადაპტერები (ახლა: Google Sheet + ლოკალური xlsx, `server/sheets/reader.js`) | A | Excel-იდან იმპორტი დასახელებულია "დამატებით ფუნქციონალში" | ერთი და იგივე გამოსავალი ორი წყაროდან: ტესტირება და დემო Google-ის გარეშეც შეიძლება. **გეგმაშია (Luka, 26–27 ოქტომბერი):** manual (`POST /api/admin/awards`) და classroom-mock |
| SEO / noindex (`robots.txt`, `X-Robots-Tag`, `SeoService`) | C | მოთხოვნა არ არის | `/verify/<კოდი>` გვერდები საძიებო სისტემაში არ უნდა მოხვდეს (კოდები არ გაჟონოს). `/verify` ინდექსირებადია, რომ საჯარო ვერიფიკაცია მოიძებნოს |

### სხვა ჩვენი დამატებები (მოკლედ)
- **ადმინ პანელი და sync ჟურნალი** (A): task.md-ში დამატებით ფუნქციონალადაა. აჩვენებს სტატუსებს, ვერსიებს, შეცდომებს.
- **ერთი ახალი ვერსია ერთ sync-ზე** (A, "ბლოკჩეინის ხარჯის ოპტიმიზაცია"): ნაკლები PDF და ნაკლები tx. მთავარი არგუმენტი 5,000 პასპორტის მასშტაბირებაზე.
- **`tamper-pdf.js`** (C): დემოსთვის საჭირო ინსტრუმენტი, სცენარი 10-ის ჩვენებას უადვილებს.
- **Retry safety (Storage ჯაჭვამდე, `getRecord` შემოწმება)** (C): ჯაჭვის შეცდომის შემდეგ PDF/ჰეში არ იცვლება.

### რა იყო მოთხოვნილი, მაგრამ ჩვენ არ გვაქვს
- **შეტყობინება სტუდენტისთვის** ახალი ვერსიის გაცემისას: task.md-ში ეს "დამატებით ფუნქციონალის" ბლოკშია. ჯერ არ გვაქვს, OTP-ის გარდა წერილები არ იგზავნება. გეგმაშია, იხ. პრიორიტეტი 7.
- **"Earned Through"**: PDF-ის ველი, მაგრამ Sheet-ში მონაცემი არ არის (ღია საკითხი 3).
