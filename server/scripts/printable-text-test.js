// Dev helper: the list of printable characters in pdf/printableText.js must be what pdf-lib really draws with the
// fonts of the renderer. Also tests the helper and the whole renderer with Georgian text. Run: npm run printable-test
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { renderPassportPdf } from '../pdf/renderer.js';
import { describeCharacter, findUnprintableCharacter, isPrintableCodePoint } from '../pdf/printableText.js';

let step = 0;
let failed = false;
async function scenario(name, work) {
  try {
    await work();
    step += 1;
    console.log(`ok ${step}  ${name}`);
  } catch (error) {
    failed = true;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}

const CHECKED_UP_TO = 0x2fff;
// Beyond the range above: Georgian Mtavruli, emoji, a CJK letter, a combining accent
const EXTRA_CODE_POINTS = [0x1c90, 0x1f600, 0x1f916, 0x4e2d, 0x0301];

// Asks pdf-lib: can both renderer fonts encode, measure and draw this character?
async function createPdfLibCheck() {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const fonts = [await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold)];
  return (codePoint) => {
    const character = String.fromCodePoint(codePoint);
    try {
      for (const font of fonts) {
        font.encodeText(character);
        font.widthOfTextAtSize(character, 10);
        page.drawText(character, { font, size: 10 });
      }
      return true;
    } catch {
      return false;
    }
  };
}

const student = { firstName: 'Saba', lastName: 'Test', passportId: 'BTU-AI-000999', firstIssued: '2026-10-27' };
const award = {
  recordId: 'MAN-0001', studentId: 'BTU-T-0004', skillName: 'AI Literacy', skillCategory: 'AI Skill',
  skillDescription: 'Understands the basics of AI.', dateEarned: '2026-10-27', earnedThrough: null,
};

await scenario(`every code point up to U+${CHECKED_UP_TO.toString(16).toUpperCase()} (and some beyond): our list equals what pdf-lib can draw`, async () => {
  const pdfLibCanDraw = await createPdfLibCheck();
  const wrong = [];
  const codePoints = [...Array(CHECKED_UP_TO + 1).keys(), ...EXTRA_CODE_POINTS];
  for (const codePoint of codePoints) {
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue; // surrogates are not characters
    if (isPrintableCodePoint(codePoint) !== pdfLibCanDraw(codePoint)) {
      wrong.push(`U+${codePoint.toString(16).toUpperCase()}`);
    }
  }
  assert.deepEqual(wrong, [], `the list and pdf-lib disagree about ${wrong.slice(0, 10).join(', ')}`);
});

await scenario('findUnprintableCharacter: accents and typographic punctuation pass, Georgian, emoji and line breaks do not', () => {
  assert.equal(findUnprintableCharacter('José Müller-Lukasiewicz'), null);
  assert.equal(findUnprintableCharacter('O’Brien “Data” – Café…'), null);
  assert.equal(findUnprintableCharacter('საბა'), 'ს');
  assert.equal(findUnprintableCharacter('AI 🤖 basics'), '🤖');
  assert.equal(findUnprintableCharacter('line\nbreak'), '\n');
  assert.equal(findUnprintableCharacter('Nino სახელი'), 'ს');
});

await scenario('findUnprintableCharacter: capitals matter for skill name and description (µ becomes the Greek Μ)', () => {
  assert.equal(findUnprintableCharacter('µ-learning'), null, 'as it is, µ can be printed');
  assert.equal(findUnprintableCharacter('µ-learning', { drawnInCapitals: true }), 'µ', 'in capitals it cannot');
  assert.equal(findUnprintableCharacter('Straße', { drawnInCapitals: true }), null, 'ß becomes SS, both printable');
});

await scenario('describeCharacter shows the character and its code; control characters only the code', () => {
  assert.equal(describeCharacter('ს'), '"ს" (U+10E1)');
  assert.equal(describeCharacter('🤖'), '"🤖" (U+1F916)');
  assert.equal(describeCharacter('\n'), 'U+000A');
});

await scenario('the real renderer: Georgian in a name or a skill fails (so the Sheet must be checked), earnedThrough is never printed', async () => {
  const bytes = await renderPassportPdf(student, [{ ...award, earnedThrough: 'BTU კლასრუმი 🎓 კურსი' }], 'ABCD-1234');
  assert.ok(bytes.length > 1000, 'a Georgian earnedThrough must not stop the PDF');
  await assert.rejects(renderPassportPdf({ ...student, firstName: 'საბა' }, [award], 'ABCD-1234'), /WinAnsi cannot encode/);
  await assert.rejects(renderPassportPdf(student, [{ ...award, skillName: 'ხელოვნური ინტელექტი' }], 'ABCD-1234'), /WinAnsi cannot encode/);
});

console.log(failed ? '\nSome scenarios FAILED.' : `\nAll ${step} scenarios passed.`);
process.exitCode = failed ? 1 : 0;
