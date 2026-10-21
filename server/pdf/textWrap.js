// Text wrapping helper, because pdf-lib has none.

// Splits text into lines that fit maxWidth. A single word wider than maxWidth stays on its own line.
export function wrapText(text, font, fontSize, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine === '' ? word : `${currentLine} ${word}`;
    const fits = font.widthOfTextAtSize(candidate, fontSize) <= maxWidth;

    if (fits || currentLine === '') {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine !== '') {
    lines.push(currentLine);
  }
  return lines;
}
