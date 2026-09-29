import type { Item, ParaItem, TableItem } from "./extract";
import { ownRuns } from "./extract";
import type { TemplateLists } from "./numbering";
import type { Classification, ParaRole } from "./roles";
import {
  BULLET_HANGING,
  COLORS,
  KEPT_RUN_STYLES,
  REVIEW_COLORS,
  SYMBOL_FONT,
  TABLE_CELL_SPACING,
  TABLE_INDENT,
  TABLE_MAX_RIGHT,
  TEXT_INDENT,
  bulletIndent,
  headingStyle,
  textStyle,
  type Level,
} from "./standards";
import {
  PPR_ORDER,
  RPR_ORDER,
  TBLPR_ORDER,
  TCPR_ORDER,
  W,
  attr,
  child,
  children,
  descendants,
  elementChildren,
  ensureFirst,
  isW,
  makeEl,
  remove,
  removeChildren,
  setChild,
  val,
  type Element,
} from "./xml";

export interface FormatSummary {
  headings: number;
  fakeHeadingsFixed: number;
  bodyParagraphs: number;
  bullets: number;
  numberedItems: number;
  captions: number;
  tablesRestyled: number;
  photoTables: number;
  tablesResized: number;
  emptyParagraphsRemoved: number;
  directFormattingRemoved: number;
  paragraphsKept: number;
  reviewColoredRuns: number;
  highlightedRuns: number;
}

export function emptySummary(): FormatSummary {
  return {
    headings: 0,
    fakeHeadingsFixed: 0,
    bodyParagraphs: 0,
    bullets: 0,
    numberedItems: 0,
    captions: 0,
    tablesRestyled: 0,
    photoTables: 0,
    tablesResized: 0,
    emptyParagraphsRemoved: 0,
    directFormattingRemoved: 0,
    paragraphsKept: 0,
    reviewColoredRuns: 0,
    highlightedRuns: 0,
  };
}

export type ChangeKind = "heading" | "body" | "bullet" | "numbered" | "caption" | "table" | "photo" | "empty";

/** One paragraph or table that was changed, described for people reviewing the result. */
export interface ChangeEntry {
  kind: ChangeKind;
  /** Heading path the change sits under, e.g. "Observations › Existing Generator System". */
  section: string;
  /** Start of the paragraph text (or the table's first row). */
  text: string;
  from: string;
  to: string;
  details: string[];
}

// Paragraph properties that the TCG styles own; any direct value would override the standard.
const LAYOUT_PPR = ["shd", "pBdr", "spacing", "ind", "jc", "outlineLvl", "contextualSpacing"];
// Run properties that the TCG styles own. Bold/italic/underline/super/subscript carry meaning and stay.
const BODY_RPR = ["rFonts", "sz", "szCs", "color", "shd", "kern", "spacing", "w", "smallCaps"];
const HEADING_RPR = [...BODY_RPR, "b", "bCs", "caps"];

const PARA_PROP_LABELS: Record<string, string> = {
  ind: "indent",
  jc: "alignment",
  spacing: "spacing",
  contextualSpacing: "spacing",
  shd: "shading",
  pBdr: "borders",
  numPr: "numbering",
  outlineLvl: "outline level",
};
const RUN_PROP_LABELS: Record<string, string> = {
  rFonts: "font",
  sz: "font size",
  szCs: "font size",
  color: "font colour",
  shd: "text shading",
  kern: "character spacing",
  spacing: "character spacing",
  w: "character spacing",
  smallCaps: "small caps",
  b: "bold",
  bCs: "bold",
  caps: "all caps",
  i: "italic",
  iCs: "italic",
  rStyle: "character style",
};

/** "Heading1" → "Heading 1", "ListParagraph" → "List Paragraph". */
export function styleLabel(id: string): string {
  return id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2");
}

function snippet(text: string, max = 90): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function labels(names: Set<string>, map: Record<string, string>): string[] {
  return [...new Set([...names].map((n) => map[n] ?? n))];
}

export class Formatter {
  summary = emptySummary();
  changes: ChangeEntry[] = [];
  /** Heading path for the change log; set by the caller as it walks the document. */
  section = "";

  // Overrides removed from the item currently being formatted.
  private removedPara = new Set<string>();
  private removedRun = new Set<string>();

  constructor(private lists: TemplateLists) {}

  private begin(): void {
    this.removedPara.clear();
    this.removedRun.clear();
  }

  private overrideDetails(): string[] {
    const out: string[] = [];
    const para = labels(this.removedPara, PARA_PROP_LABELS);
    const run = labels(this.removedRun, RUN_PROP_LABELS);
    if (para.length) out.push(`Removed manual ${para.join(", ")}`);
    if (run.length) out.push(`Removed manual ${run.join(", ")} on the text`);
    return out;
  }

  private record(kind: ChangeKind, text: string, from: string, to: string, details: string[]): void {
    this.changes.push({ kind, section: this.section, text: snippet(text), from, to, details });
    // Summary counts follow the change log, so paragraphs that were already correct aren't counted.
    if (kind === "heading") this.summary.headings++;
    else if (kind === "body") this.summary.bodyParagraphs++;
    else if (kind === "bullet") this.summary.bullets++;
    else if (kind === "numbered") this.summary.numberedItems++;
    else if (kind === "caption") this.summary.captions++;
  }

  // ---- runs ----

  private stripRunProps(rPr: Element | null, strip: string[]): void {
    if (!rPr) return;
    for (const el of elementChildren(rPr)) {
      const name = el.localName ?? "";
      if (!strip.includes(name) && name !== "rStyle" && name !== "highlight") continue;
      if (name === "rStyle") {
        if (KEPT_RUN_STYLES.has(val(el) ?? "")) continue;
      } else if (name === "highlight") {
        if (val(el) !== "none") this.summary.highlightedRuns++;
        continue;
      } else if (name === "rFonts") {
        const fonts = ["ascii", "hAnsi", "cs", "eastAsia"].map((a) => attr(el, a) ?? "").join(" ");
        if (SYMBOL_FONT.test(fonts)) continue;
      } else if (name === "color") {
        if (REVIEW_COLORS.has((val(el) ?? "").toUpperCase())) {
          this.summary.reviewColoredRuns++;
          continue;
        }
      }
      rPr.removeChild(el);
      this.removedRun.add(name);
      this.summary.directFormattingRemoved++;
    }
  }

  private cleanRuns(p: Element, strip: string[]): void {
    this.stripRunProps(child(child(p, "pPr"), "rPr"), strip);
    for (const r of ownRuns(p)) this.stripRunProps(child(r, "rPr"), strip);
  }

  // ---- paragraph properties ----

  private setStyle(p: Element, styleId: string): Element {
    const pPr = ensureFirst(p, "pPr");
    setChild(pPr, makeEl(p.ownerDocument!, "pStyle", { val: styleId }), PPR_ORDER);
    return pPr;
  }

  /** Removes the named direct paragraph properties, remembering them for the change log. */
  private removePara(pPr: Element, names: string[]): void {
    for (const c of elementChildren(pPr)) {
      const name = c.localName ?? "";
      if (!names.includes(name)) continue;
      pPr.removeChild(c);
      this.removedPara.add(name);
      this.summary.directFormattingRemoved++;
    }
  }

  private clearLayout(pPr: Element, extra: string[] = []): void {
    this.removePara(pPr, [...LAYOUT_PPR, ...extra]);
  }

  private setNumbering(pPr: Element, numId: string, ilvl: number): void {
    const doc = pPr.ownerDocument!;
    const numPr = makeEl(doc, "numPr");
    numPr.appendChild(makeEl(doc, "ilvl", { val: ilvl }));
    numPr.appendChild(makeEl(doc, "numId", { val: numId }));
    setChild(pPr, numPr, PPR_ORDER);
  }

  /** Records a paragraph change if its style changed or any override was removed. */
  private finishParagraph(kind: ChangeKind, p: ParaItem, to: string, extra: string[] = []): void {
    const from = describeOriginal(p);
    const details = [...extra, ...this.overrideDetails()];
    if (from === to && !details.length) return;
    this.record(kind, p.text, from, to, details);
  }

  heading(p: ParaItem, level: Level): void {
    this.begin();
    const fake = !/^Heading\d$/.test(p.style);
    if (fake) this.summary.fakeHeadingsFixed++;
    const pPr = this.setStyle(p.el, headingStyle(level));
    this.clearLayout(pPr, ["numPr"]);
    this.cleanRuns(p.el, HEADING_RPR);
    this.finishParagraph("heading", p, styleLabel(headingStyle(level)), fake ? ["Typed as formatted text — converted to a real heading so it is numbered and appears in the table of contents"] : []);
  }

  body(p: ParaItem, level: Level): void {
    this.begin();
    const pPr = this.setStyle(p.el, textStyle(level));
    this.clearLayout(pPr, ["numPr"]);
    this.cleanRuns(p.el, BODY_RPR);
    const extra = p.list ? ["Removed list numbering — this is a lead-in line, not a list item"] : [];
    this.finishParagraph("body", p, styleLabel(textStyle(level)), extra);
  }

  listItem(p: ParaItem, level: Level, listLevel: number, numbered: boolean): void {
    this.begin();
    const oldInd = child(child(p.el, "pPr"), "ind");
    const newLeft = bulletIndent(level, listLevel);
    // Without a manual indent, a first-level item sits at the TCG list's own default (the Text 1 bullet position).
    const oldLeft = oldInd ? Number(attr(oldInd, "left") ?? attr(oldInd, "start")) : p.ilvl === 0 ? bulletIndent(1, 0) : NaN;
    const indentChanged = oldLeft !== newLeft;
    const pPr = this.setStyle(p.el, "ListParagraph");
    this.clearLayout(pPr);
    // The new indent below replaces any old one; it is reported as "indent corrected" instead.
    this.removedPara.delete("ind");
    const keepNumbers = numbered && !!p.numId;
    this.setNumbering(pPr, keepNumbers ? p.numId! : this.lists.bulletNumId, listLevel);
    setChild(pPr, makeEl(p.el.ownerDocument!, "ind", { left: bulletIndent(level, listLevel), hanging: BULLET_HANGING }), PPR_ORDER);
    this.cleanRuns(p.el, BODY_RPR);
    const levelText = listLevel ? `, level ${listLevel + 1}` : "";
    const restyled = p.style !== "ListParagraph";
    const extra = [
      ...(restyled ? [keepNumbers ? "Kept its numbering, moved to the list style" : "Changed to the TCG bullet"] : []),
      ...(listLevel !== p.ilvl ? [`Nesting level changed from ${p.ilvl + 1} to ${listLevel + 1}`] : []),
      ...(indentChanged ? ["Indent corrected to line up with the section"] : []),
    ];
    const overrides = this.overrideDetails();
    if (!extra.length && !overrides.length) return;
    this.record(keepNumbers ? "numbered" : "bullet", p.text, describeOriginal(p), keepNumbers ? "Numbered list" : `TCG bullet${levelText}`, [...extra, ...overrides]);
  }

  caption(p: ParaItem, level: Level): void {
    this.begin();
    const pPr = this.setStyle(p.el, "Caption");
    this.clearLayout(pPr, ["numPr"]);
    this.removedPara.delete("ind");
    setChild(pPr, makeEl(p.el.ownerDocument!, "ind", { left: TEXT_INDENT[level] }), PPR_ORDER);
    this.cleanRuns(p.el, [...BODY_RPR, "i", "iCs"]);
    this.finishParagraph("caption", p, "Caption");
  }

  /** Deletes an empty paragraph unless it separates two tables (they would merge) or ends the body. */
  removeEmpty(p: Element, after: string): void {
    const prev = previousElement(p);
    const next = nextElement(p);
    if (!next || isW(next, "sectPr") || isW(prev, "tbl") || isW(next, "tbl")) return;
    remove(p);
    this.summary.emptyParagraphsRemoved++;
    const text = after ? `after “${snippet(after, 60)}”` : "";
    const last = this.changes[this.changes.length - 1];
    if (last?.kind === "empty" && last.text === text && last.section === this.section) {
      const n = (Number(last.from.split(" ")[0]) || 1) + 1;
      last.from = `${n} empty lines`;
      return;
    }
    this.record("empty", text, "1 empty line", "Removed", []);
  }

  // ---- tables ----

  dataTable(t: TableItem, level: Level, headerRows: number): void {
    this.begin();
    const doc = t.el.ownerDocument!;
    const tblPr = ensureFirst(t.el, "tblPr");
    const oldStyle = val(child(tblPr, "tblStyle"));
    setChild(tblPr, makeEl(doc, "tblStyle", { val: "TableGrid" }), TBLPR_ORDER);
    removeChildren(tblPr, ["jc", "tblBorders", "shd"]);
    const indent = TABLE_INDENT[level];
    setChild(tblPr, makeEl(doc, "tblInd", { w: indent, type: "dxa" }), TBLPR_ORDER);
    const resized = this.fitWidth(t.el, TABLE_MAX_RIGHT - indent);
    if (resized) this.summary.tablesResized++;

    children(t.el, "tr").forEach((tr, ri) => {
      const header = ri < headerRows;
      if (header) {
        const trPr = ensureFirst(tr, "trPr");
        if (!child(trPr, "tblHeader")) trPr.appendChild(makeEl(doc, "tblHeader"));
      }
      for (const tc of children(tr, "tc")) {
        const tcPr = ensureFirst(tc, "tcPr");
        const borders = makeEl(doc, "tcBorders");
        for (const [side, sz] of [["top", ri === 0 ? 2 : 36], ["left", 2], ["bottom", 36], ["right", 2]] as const) {
          borders.appendChild(makeEl(doc, side, { val: "single", sz, space: 0, color: COLORS.white }));
        }
        setChild(tcPr, borders, TCPR_ORDER);
        setChild(tcPr, makeEl(doc, "shd", { val: "clear", color: "auto", fill: header ? COLORS.tableHeader : COLORS.tableBody }), TCPR_ORDER);
        setChild(tcPr, makeEl(doc, "vAlign", { val: "center" }), TCPR_ORDER);
        for (const p of children(tc, "p")) this.cellParagraph(p, header);
      }
    });
    this.summary.tablesRestyled++;

    const details = [
      headerRows ? "Header row shaded light blue, bold and centred; repeats at the top of each page" : "No header row",
      "Body rows shaded with white row separators",
      `Indented to line up with section level ${level}`,
      ...(resized ? ["Columns narrowed proportionally to fit within the page margin"] : []),
      ...this.overrideDetails().map((d) => d.replace("Removed manual", "Removed manual cell")),
    ];
    this.record("table", t.firstRow, `Table ${t.rows}×${t.cols}${oldStyle ? ` (${styleLabel(oldStyle)})` : ""}`, "TCG table", details);
  }

  private cellParagraph(p: Element, header: boolean): void {
    const doc = p.ownerDocument!;
    const pPr = ensureFirst(p, "pPr");
    const style = val(child(pPr, "pStyle")) ?? "Normal";
    const isList = !!child(pPr, "numPr") || style === "ListParagraph" || style === "ListParaforTables";
    this.cleanRuns(p, BODY_RPR);
    if (header) {
      removeChildren(pPr, ["pStyle", "numPr"]);
      this.clearLayout(pPr);
      setChild(pPr, makeEl(doc, "jc", { val: "center" }), PPR_ORDER);
      for (const r of ownRuns(p)) {
        const rPr = ensureFirst(r, "rPr");
        setChild(rPr, makeEl(doc, "b"), RPR_ORDER);
        setChild(rPr, makeEl(doc, "bCs"), RPR_ORDER);
      }
      return;
    }
    if (isList) {
      setChild(pPr, makeEl(doc, "pStyle", { val: "ListParaforTables" }), PPR_ORDER);
      this.removePara(pPr, ["ind", "spacing", "shd"]);
      return;
    }
    removeChildren(pPr, ["pStyle"]);
    this.removePara(pPr, ["ind", "spacing", "shd", "outlineLvl"]);
    setChild(pPr, makeEl(doc, "spacing", { before: TABLE_CELL_SPACING, after: TABLE_CELL_SPACING }), PPR_ORDER);
  }

  /** Scales column widths down proportionally when the table would run past the right margin. */
  private fitWidth(tbl: Element, maxWidth: number): boolean {
    const tblGrid = child(tbl, "tblGrid");
    const grid = tblGrid ? children(tblGrid, "gridCol") : [];
    const total = grid.reduce((s, g) => s + (Number(attr(g, "w")) || 0), 0);
    if (!grid.length || total <= maxWidth) return false;
    const f = maxWidth / total;
    const scale = (el: Element) => el.setAttributeNS(W, "w:w", String(Math.floor((Number(attr(el, "w")) || 0) * f)));
    grid.forEach(scale);
    for (const tcW of descendants(tbl, "tcW")) if (attr(tcW, "type") === "dxa") scale(tcW);
    const tblW = child(child(tbl, "tblPr"), "tblW");
    if (tblW && attr(tblW, "type") === "dxa") scale(tblW);
    return true;
  }

  photoTable(t: TableItem): void {
    const doc = t.el.ownerDocument!;
    const tblPr = ensureFirst(t.el, "tblPr");
    removeChildren(tblPr, ["tblInd"]);
    setChild(tblPr, makeEl(doc, "jc", { val: "center" }), TBLPR_ORDER);
    const borders = makeEl(doc, "tblBorders");
    for (const side of ["top", "left", "bottom", "right", "insideH", "insideV"]) {
      borders.appendChild(makeEl(doc, side, { val: "none", sz: 0, space: 0, color: "auto" }));
    }
    setChild(tblPr, borders, TBLPR_ORDER);
    this.summary.photoTables++;
    this.record("photo", t.firstRow, `Photo table ${t.rows}×${t.cols}`, "Centred photo grid", ["Centred on the page", "Borders removed"]);
  }
}

/** How a paragraph looked before formatting, e.g. "Normal (bold, caps, numbered)". */
function describeOriginal(p: ParaItem): string {
  const traits = [
    p.bold ? "bold" : null,
    p.caps ? "all caps" : null,
    p.shaded ? "shaded" : null,
    // Heading styles are numbered by design; only mention lists on other paragraphs.
    /^Heading\d$/.test(p.style) ? null : p.list === "bullet" ? "bulleted" : p.list === "numbered" ? "numbered" : null,
  ].filter(Boolean);
  const style = styleLabel(p.style);
  return traits.length ? `${style} (${traits.join(", ")})` : style;
}

function previousElement(el: Element): Element | null {
  for (let n = el.previousSibling; n; n = n.previousSibling) if (n.nodeType === 1) return n as Element;
  return null;
}

function nextElement(el: Element): Element | null {
  for (let n = el.nextSibling; n; n = n.nextSibling) if (n.nodeType === 1) return n as Element;
  return null;
}

const HEADING_LEVEL: Partial<Record<ParaRole, Level>> = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5 };

export interface ApplyResult {
  summary: FormatSummary;
  changes: ChangeEntry[];
}

/** Walks the items in document order, tracking the current heading level, and applies each decision. */
export function applyClassification(items: Item[], cls: Classification, lists: TemplateLists): ApplyResult {
  const f = new Formatter(lists);
  let level: Level = 1;
  let region: string | null = null;
  const path: string[] = [];
  let lastText = "";
  for (const item of items) {
    if (item.region !== region) {
      region = item.region;
      level = 1;
    }
    f.section = path.slice(0, 2).filter(Boolean).join(" › ");
    if (item.type === "t") {
      const d = cls.tables.get(item.id);
      if (d?.kind === "DATA") f.dataTable(item, level, Math.min(d.headerRows, item.rows - 1));
      else if (d?.kind === "PHOTO") f.photoTable(item);
      lastText = item.firstRow;
      continue;
    }
    if (item.empty) {
      f.removeEmpty(item.el, lastText);
      continue;
    }
    if (item.text.trim()) lastText = item.text;
    const d = cls.paragraphs.get(item.id) ?? { role: "KEEP" as const, listLevel: 0 };
    const headingLevel = HEADING_LEVEL[d.role];
    if (headingLevel) {
      level = headingLevel;
      path.length = headingLevel - 1;
      path[headingLevel - 1] = item.text.replace(/\s+/g, " ").trim();
      f.section = path.slice(0, 2).filter(Boolean).join(" › ");
      f.heading(item, headingLevel);
    } else if (d.role === "BODY") f.body(item, level);
    else if (d.role === "CLOSING") f.body(item, 1);
    else if (d.role === "BULLET") f.listItem(item, level, clampList(d.listLevel), false);
    else if (d.role === "NUMBERED") f.listItem(item, level, clampList(d.listLevel), true);
    else if (d.role === "CAPTION") f.caption(item, level);
    else if (item.text.trim()) f.summary.paragraphsKept++;
  }
  return { summary: f.summary, changes: f.changes };
}

function clampList(n: number): number {
  return Math.max(0, Math.min(2, Math.floor(n) || 0));
}
