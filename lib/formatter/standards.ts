// TCG report standards, taken from "TCG Source Template - Report.docx".
// Indents are in twentieths of a point (dxa); 1440 = 1 inch.

export const COLORS = {
  navy: "1B325A",
  blue: "0085CA",
  tableHeader: "CCE7F8",
  tableBody: "EDF7FD",
  white: "FFFFFF",
  caption: "44546A",
};

export type Level = 1 | 2 | 3 | 4 | 5;

export const headingStyle = (level: Level) => `Heading${level}`;
export const textStyle = (level: Level) => `Text${level}`;

/** Left indent of the Text1–Text5 styles; body text sits here under a heading of that level. */
export const TEXT_INDENT: Record<Level, number> = { 1: 1080, 2: 1296, 3: 1440, 4: 1685, 5: 1973 };

/** Bullets hang 360 from the text edge of their section, 360 more per nested level. */
export const BULLET_HANGING = 360;
export function bulletIndent(textLevel: Level, listLevel: number): number {
  return TEXT_INDENT[textLevel] + BULLET_HANGING * (listLevel + 1);
}

/** tblInd of the template's "Typical Nth Level Table" samples. */
export const TABLE_INDENT: Record<Level, number> = { 1: 1134, 2: 1415, 3: 1557, 4: 1840, 5: 2124 };
/** Right edge (tblInd + width) of the widest template table; wider tables are scaled down to fit. */
export const TABLE_MAX_RIGHT = 10770;

/** Cell spacing inside data tables (template: before/after 20). */
export const TABLE_CELL_SPACING = 20;

/** Styles whose definitions are copied verbatim from the template into every output. */
export const SYNCED_STYLES = [
  "Normal",
  "Heading1", "Heading2", "Heading3", "Heading4", "Heading5",
  "Heading1Char", "Heading2Char", "Heading3Char", "Heading4Char", "Heading5Char",
  "Text1", "Text2", "Text3", "Text4", "Text5",
  "ListParagraph", "ListParagraphChar", "ListParaforTables", "ListParaforTablesChar",
  "TableGrid", "TOCHeading", "TOC1", "TOC2", "TOC3",
];

/** Table/figure caption style — the template has none, so it is defined here (Word's built-in look). */
export const CAPTION_STYLE_ID = "Caption";
export const CAPTION_STYLE_XML = `<w:style xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="35"/><w:unhideWhenUsed/><w:qFormat/><w:pPr><w:spacing w:before="80" w:after="200" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="${COLORS.caption}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>`;

/** Run colours that usually mark reviewer notes; kept (and reported) rather than stripped. */
export const REVIEW_COLORS = new Set(["FF0000", "C00000", "E00000", "EE0000", "FF3333"]);

/** Character styles that carry meaning and are never stripped from runs. */
export const KEPT_RUN_STYLES = new Set(["Hyperlink", "CommentReference", "FootnoteReference", "EndnoteReference", "FollowedHyperlink"]);

/** Fonts that encode symbols; runs using them keep their rFonts. */
export const SYMBOL_FONT = /symbol|wingdings|webdings|math/i;
