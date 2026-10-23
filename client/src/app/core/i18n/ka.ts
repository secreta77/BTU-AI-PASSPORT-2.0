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
