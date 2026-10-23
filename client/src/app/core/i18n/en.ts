import type { Translations } from './ka';

// Typed with Translations: a missing or extra key is a compile error.
export const en: Translations = {
  'lang.label': 'Language',
  'lang.ka': 'ქარ',
  'lang.en': 'ENG',

  'header.title': 'AI Skills Digital Passport',
  'footer.text': 'BTU AI Skills Digital Passport. Hackathon prototype.',

  'common.comingSoon': 'Coming soon.',

  'verify.title': 'Verify a passport',
  'verify.codeLabel': 'Verification code',
  'verify.enterCode': 'Enter a verification code.',

  'verify.codePlaceholder': 'e.g. BTU-V-7F3K-92QX',
  'verify.submit': 'Verify',
  'verify.loading': 'Verifying…',
  'verify.found.title': 'Record found',
  'verify.found.hint': 'The code is in the BTU registry.',
  'verify.passportId': 'Passport ID',
  'verify.version': 'Version',
  'verify.status': 'Status',
  'verify.issuedAt': 'Issue date',
  'verify.transaction': 'Transaction',
  'verify.viewOnEtherscan': 'View on Etherscan',
  'verify.outdatedHint': 'A newer version exists: v{n}.',
  'verify.notFound.title': 'Unknown code',
  'verify.notFound.text': 'This code was not found. Please check that it is typed correctly.',
  'verify.error.title': 'Server error',
  'verify.error.text': 'Verification is not possible right now. Please try again later.',
  'verify.retry': 'Try again',

  'status.latest': 'Latest version',
  'status.outdated': 'Outdated version',

  'login.title': 'Student login',
  'login.subtitle': 'Log in with your email.',

  'myPassport.title': 'My passport',
  'myPassport.subtitle': 'Your skills and passport PDF.',

  'admin.title': 'Admin',
  'admin.subtitle': 'Passports, sync and log.',
};
