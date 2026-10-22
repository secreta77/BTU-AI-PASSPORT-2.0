// All PDF coordinates and sizes (the only place for them). Units: PDF points, origin bottom-left.
// Values were measured on the design PNGs (1287 x 910 px), so they are written in PNG pixels
// and converted with toX / toY / toSize. To tune a value, read the pixel position in the PNG.
export const PAGE = { width: 841.89, height: 595.28 };

const DESIGN_IMAGE_WIDTH = 1287;
const PT_PER_PX = PAGE.width / DESIGN_IMAGE_WIDTH;

const toX = (px) => px * PT_PER_PX;
const toY = (pxFromTop) => PAGE.height - pxFromTop * PT_PER_PX; // PNG y goes down, PDF y goes up
const toSize = (px) => px * PT_PER_PX;

export const TEXT_COLOR = { r: 43, g: 43, b: 43 }; // BTU dark #2B2B2B

// Used to hide the template's decorative asterisk in a filled stamp card
export const BACKDROP_COLOR = { r: 255, g: 255, b: 255 };

// Page 1: values written after the NAME / SURNAME / DATE labels
export const PAGE_1 = {
  name: { x: toX(300), y: toY(418), size: 22 },
  surname: { x: toX(372), y: toY(478), size: 22 },
  date: { x: toX(995), y: toY(408), size: 18 },
  // Verification block in the empty space under SURNAME (bottom-left corner of the QR square)
  qr: { x: toX(165), y: toY(640), size: toSize(130) },
  verificationLabel: { x: toX(315), y: toY(560), size: 9 },
  verificationCode: { x: toX(315), y: toY(582), size: 14 },
};

// "PASSPORT ID:" footer, index 0..3 = pages 1..4.
// right: the label sits at the right edge, so the value goes under it, right-aligned at x.
// left: the label sits at the left edge, so the value goes right after it, starting at x.
const FOOTER_UNDER_LABEL_RIGHT = { x: toX(1162), y: toY(775), size: 12, align: 'right' };
const FOOTER_AFTER_LABEL_LEFT = { x: toX(240), y: toY(751), size: 14, align: 'left' };

export const PASSPORT_ID_FOOTER = [
  FOOTER_UNDER_LABEL_RIGHT,
  FOOTER_AFTER_LABEL_LEFT,
  FOOTER_UNDER_LABEL_RIGHT,
  FOOTER_AFTER_LABEL_LEFT,
];

// Page 3: 10 stamp cards, 5 columns x 2 rows
const CARD_COLUMN_LEFTS_PX = [119, 333, 546, 760, 974];
const CARD_ROW_TOPS_PX = [212, 459];
const CARD_WIDTH_PX = 201;

export const PAGE_3 = {
  maxCards: 10,
  // centerX and top edge of every card, in reading order
  cards: CARD_ROW_TOPS_PX.flatMap((topPx) =>
    CARD_COLUMN_LEFTS_PX.map((leftPx) => ({
      centerX: toX(leftPx + CARD_WIDTH_PX / 2),
      top: toY(topPx),
    })),
  ),
  // Offsets are measured down from the card top
  date: { offset: toSize(28), size: 8 },
  // The stamp is scaled to fit this box (aspect ratio kept): triangle and circle are tall, so height limits them.
  // The box sits between the date and the skill name. The backdrop is centered on the template asterisk.
  stamp: { centerOffset: toSize(98), maxWidth: toSize(150), maxHeight: toSize(100) },
  backdrop: { centerOffset: toSize(113), width: toSize(100), height: toSize(56) },
  skillName: { firstBaselineOffset: toSize(171), size: 10, lineHeight: 12, maxWidth: toSize(180), maxLines: 3 },
  category: { gapBelowName: 14, size: 10 },
};

// Page 4: table with 5 rows
const TABLE_FIRST_ROW_TOP_PX = 290;
const TABLE_ROW_HEIGHT_PX = 82.4;

export const PAGE_4 = {
  maxRows: 5,
  rowCenters: [0, 1, 2, 3, 4].map((index) =>
    toY(TABLE_FIRST_ROW_TOP_PX + TABLE_ROW_HEIGHT_PX * index + TABLE_ROW_HEIGHT_PX / 2),
  ),
  stamp: { centerX: toX(218), maxWidth: toSize(110), maxHeight: toSize(64) }, // row height is 82px
  // Hides the template's decorative circle under the stamp in a filled row
  backdrop: { width: toSize(60), height: toSize(60) },
  // Text must stay inside the row: row height minus a small margin top and bottom
  cellMaxHeight: toSize(TABLE_ROW_HEIGHT_PX - 14),
  minFontSize: 7,
  skill: { centerX: toX(386), maxWidth: toSize(124), size: 11, lineHeight: 13 },
  description: { centerX: toX(571), maxWidth: toSize(190), size: 8, lineHeight: 10 },
  earnedThrough: { centerX: toX(815), maxWidth: toSize(200), size: 7, lineHeight: 9 },
  dateEarned: { centerX: toX(1058), size: 9 },
};
