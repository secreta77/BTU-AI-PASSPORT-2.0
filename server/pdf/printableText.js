// Which characters the passport PDF can print.
// The renderer draws with the standard Helvetica fonts (WinAnsi encoding): Latin letters with accents, digits and
// the usual punctuation. Georgian, Cyrillic, Greek and emoji are NOT in it, and pdf-lib throws "WinAnsi cannot
// encode" when it meets one. The Sheet validator uses this, so a bad row is refused with a clear message instead of
// failing the whole student at issue time (and again at every sync after that).
// The list below is the exact answer of pdf-lib. scripts/printable-text-test.js checks it against pdf-lib itself.
const PRINTABLE_RANGES = [
  [0x20, 0x7e], [0xa0, 0xff], [0x152, 0x153], [0x160, 0x161], [0x178, 0x178], [0x17d, 0x17e], [0x192, 0x192],
  [0x2c6, 0x2c6], [0x2dc, 0x2dc], [0x2013, 0x2014], [0x2018, 0x201a], [0x201c, 0x201e], [0x2020, 0x2022],
  [0x2026, 0x2026], [0x2030, 0x2030], [0x2039, 0x203a], [0x20ac, 0x20ac], [0x2122, 0x2122],
];

export function isPrintableCodePoint(codePoint) {
  return PRINTABLE_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);
}

// Returns the first character of `text` that the PDF cannot print, or null when all can be printed.
// drawnInCapitals: the renderer prints this field in capitals (skill name, description), and a few letters
// change in capitals (µ becomes the Greek Μ), so the capital form is what has to be printable.
export function findUnprintableCharacter(text, { drawnInCapitals = false } = {}) {
  for (const character of text) {
    const drawn = drawnInCapitals ? character.toUpperCase() : character;
    for (const drawnCharacter of drawn) {
      if (!isPrintableCodePoint(drawnCharacter.codePointAt(0))) {
        return character;
      }
    }
  }
  return null;
}

// Shows the character and its code, e.g. U+10E1. Control characters have no visible form, so only their code is shown.
export function describeCharacter(character) {
  const codePoint = character.codePointAt(0);
  const code = `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
  const isControl = codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0);
  return isControl ? code : `"${character}" (${code})`;
}
