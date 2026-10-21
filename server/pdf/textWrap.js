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

const FONT_SIZE_STEP = 0.5;

// Wraps text and shrinks the font step by step until the block fits maxHeight
// and no line (e.g. one long word) is wider than maxWidth.
// Stops at minSize even if the text still does not fit. Line height keeps its ratio to the font size.
// Returns { lines, size, lineHeight, fits }. fits is false when the text still does not fit at minSize.
export function fitTextToCell(text, font, { size, minSize, lineHeight, maxWidth, maxHeight }) {
  const lineHeightRatio = lineHeight / size;
  let currentSize = size;

  while (true) {
    const currentLineHeight = currentSize * lineHeightRatio;
    const lines = wrapText(text, font, currentSize, maxWidth);
    const blockHeight = (lines.length - 1) * currentLineHeight + currentSize;

    const widestLine = Math.max(...lines.map((line) => font.widthOfTextAtSize(line, currentSize)));
    const fits = blockHeight <= maxHeight && widestLine <= maxWidth;

    if (fits || currentSize - FONT_SIZE_STEP < minSize) {
      return { lines, size: currentSize, lineHeight: currentLineHeight, fits };
    }
    currentSize -= FONT_SIZE_STEP;
  }
}
