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

  'login.title': 'შესვლა სტუდენტებისთვის',
  'login.subtitle': 'შესვლა ელფოსტით.',

  'myPassport.title': 'ჩემი პასპორტი',
  'myPassport.subtitle': 'თქვენი უნარები და პასპორტის PDF.',

  'admin.title': 'ადმინისტრირება',
  'admin.subtitle': 'პასპორტები, სინქრონიზაცია და ჟურნალი.',
};

export type Translations = typeof ka;
export type TranslationKey = keyof Translations;
