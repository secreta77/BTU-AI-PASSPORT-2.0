// Source of truth for translation keys. en.ts must have exactly the same keys.
export const ka = {
  'lang.label': 'ენა',
  'lang.ka': 'ქარ',
  'lang.en': 'ENG',

  'header.title': 'AI უნარების ციფრული პასპორტი',
  'footer.text': 'BTU AI უნარების ციფრული პასპორტი. ჰაკათონის პროტოტიპი.',

  'common.comingSoon': 'მალე დაემატება.',

  'verify.title': 'პასპორტის გადამოწმება',
  'verify.codeLabel': 'ვერიფიკაციის კოდი',
  'verify.enterCode': 'შეიყვანეთ ვერიფიკაციის კოდი.',

  'verify.codePlaceholder': 'მაგ., BTU-V-7F3K-92QX',
  'verify.submit': 'გადამოწმება',
  'verify.loading': 'მიმდინარეობს გადამოწმება…',
  'verify.found.title': 'ჩანაწერი მოიძებნა',
  'verify.found.hint': 'კოდი BTU-ს რეესტრშია.',
  'verify.passportId': 'პასპორტის ID',
  'verify.version': 'ვერსია',
  'verify.status': 'სტატუსი',
  'verify.issuedAt': 'გაცემის თარიღი',
  'verify.transaction': 'ტრანზაქცია',
  'verify.viewOnEtherscan': 'იხილეთ Etherscan-ზე',
  'verify.outdatedHint': 'არსებობს უფრო ახალი ვერსია: v{n}.',
  'verify.notFound.title': 'უცნობი კოდი',
  'verify.notFound.text': 'ასეთი კოდი ვერ მოიძებნა. შეამოწმეთ, სწორად არის თუ არა შეყვანილი.',
  'verify.error.title': 'სერვერის შეცდომა',
  'verify.error.text': 'გადამოწმება ახლა ვერ ხერხდება. სცადეთ მოგვიანებით.',
  'verify.retry': 'სცადეთ ხელახლა',

  'verify.chain.title': 'ბლოკჩეინზე დამოუკიდებლად შემოწმდა',
  'verify.chain.hint': 'თქვენი ბრაუზერი მონაცემებს პირდაპირ ბლოკჩეინიდან კითხულობს, ჩვენი სერვერის გარეშე.',
  'verify.chain.checking': 'ბლოკჩეინი მოწმდება…',
  'verify.chain.issuerOk': 'გამცემი არის BTU',
  'verify.chain.issuerBad': 'გამცემი არ ემთხვევა BTU-ს',
  'verify.chain.versionOk': 'ვერსია ემთხვევა: v{n}',
  'verify.chain.versionBad': 'ვერსია არ ემთხვევა ბლოკჩეინის ჩანაწერს',
  'verify.chain.notOnChain': 'ეს კოდი ბლოკჩეინზე ვერ მოიძებნა',
  'verify.chain.failed': 'ბლოკჩეინის წაკითხვა ახლა ვერ ხერხდება.',
  'verify.chain.retry': 'სცადეთ ხელახლა',

  'verify.file.title': 'ფაილის შემოწმება',
  'verify.file.hint': 'ატვირთეთ პასპორტის PDF. ფაილი სერვერზე არ იგზავნება.',
  'verify.file.drop': 'გადმოიტანეთ PDF აქ',
  'verify.file.choose': 'ან აირჩიეთ ფაილი',
  'verify.file.onlyPdf': 'გთხოვთ, აირჩიოთ PDF ფაილი.',
  'verify.file.hashing': 'ფაილი მოწმდება…',
  'verify.file.authentic': 'ფაილი ნამდვილია',
  'verify.file.authenticText': 'ფაილი ზუსტად ემთხვევა BTU-ს მიერ გაცემულ დოკუმენტს.',
  'verify.file.outdated': 'ფაილი ნამდვილია, მაგრამ მოძველებულია',
  'verify.file.outdatedText': 'არსებობს უფრო ახალი ვერსია: v{n}.',
  'verify.file.modified': 'ფაილი შეცვლილია',
  'verify.file.modifiedText': 'ფაილი არ ემთხვევა BTU-ს მიერ გაცემულ დოკუმენტს.',
  'verify.file.another': 'სხვა ფაილის შემოწმება',

  'status.latest': 'უახლესი ვერსია',
  'status.outdated': 'მოძველებული ვერსია',

  'login.title': 'შესვლა სტუდენტებისთვის',
  'login.subtitle': 'შესვლა ელფოსტით.',

  'myPassport.title': 'ჩემი პასპორტი',
  'myPassport.subtitle': 'თქვენი უნარები და პასპორტის PDF.',

  'admin.title': 'ადმინისტრირება',
  'admin.subtitle': 'პასპორტები, სინქრონიზაცია და ჟურნალი.',
};

export type Translations = typeof ka;
export type TranslationKey = keyof Translations;
