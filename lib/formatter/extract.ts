import type { ListFormat, NumberingView } from "./numbering";
import { attr, child, children, descendants, elementChildren, isW, textOf, val, wName, type Document, type Element } from "./xml";

export type Region = "cover" | "toc" | "main" | "signature" | "limitations" | "appendix";

export interface ParaItem {
  type: "p";
  id: number;
  el: Element;
  region: Region;
  style: string;
  numId: string | null;
  ilvl: number;
  list: ListFormat | null;
  text: string;
  empty: boolean;
  hasDrawing: boolean;
  bold: boolean;
  caps: boolean;
  shaded: boolean;
  outlineLvl: number | null;
  /** Largest explicit font size in points, if any run sets one. */
  sizePt: number | null;
}

export interface TableItem {
  type: "t";
  id: number;
  el: Element;
  region: Region;
  rows: number;
  cols: number;
  hasDrawing: boolean;
  firstRow: string;
  preview: string;
}

export type Item = ParaItem | TableItem;

// ---- styles (original report styles, before sync) ----

export class StyleView {
  private styles = new Map<string, Element>();
  constructor(doc: Document | null) {
    if (!doc) return;
    for (const s of descendants(doc, "style")) {
      const id = attr(s, "styleId");
      if (id) this.styles.set(id, s);
    }
  }

  /** numPr inherited through basedOn, as [numId, ilvl]. */
  numPr(styleId: string): [string | null, number] {
    let numId: string | null = null;
    let ilvl: number | null = null;
    const seen = new Set<string>();
    for (let s = this.styles.get(styleId); s && !seen.has(styleId); ) {
      seen.add(styleId);
      const np = child(child(s, "pPr"), "numPr");
      if (np) {
        numId ??= val(child(np, "numId"));
        ilvl ??= child(np, "ilvl") ? Number(val(child(np, "ilvl"))) : null;
      }
      styleId = val(child(s, "basedOn")) ?? "";
      s = this.styles.get(styleId);
    }
    return [numId, ilvl ?? 0];
  }

  /** Paragraph style id whose (case-insensitive) name matches, e.g. "heading 1" → "Heading1". */
  name(styleId: string): string {
    return val(child(this.styles.get(styleId) ?? null, "name")) ?? styleId;
  }
}

// ---- helpers ----

const CONTENT_MARKERS = [
  "drawing", "pict", "object", "sectPr", "bookmarkStart", "bookmarkEnd", "commentRangeStart", "commentRangeEnd",
  "commentReference", "fldChar", "instrText", "fldSimple", "ins", "del", "moveFrom", "moveTo", "footnoteReference",
  "endnoteReference", "sdt", "t", "delText", "sym", "tab", "pPrChange",
];

/** A paragraph that shows nothing and carries nothing (safe to delete). */
export function isEmptyParagraph(p: Element): boolean {
  for (const name of CONTENT_MARKERS) {
    if (name === "tab") {
      // A tab stop definition in pPr is fine; a tab character in a run is content.
      if (descendants(p, "tab").some((t) => isW(t.parentNode as Element, "r"))) return false;
      continue;
    }
    if (descendants(p, name).length) return false;
  }
  for (const br of descendants(p, "br")) if (attr(br, "type") === "page") return false;
  if (child(child(p, "pPr"), "pageBreakBefore")) return false;
  return true;
}

export function paragraphStyle(p: Element): string {
  return val(child(child(p, "pPr"), "pStyle")) ?? "Normal";
}

/** Runs that belong to this paragraph (not to a text box nested inside it). */
export function ownRuns(p: Element): Element[] {
  return descendants(p, "r").filter((r) => {
    for (let n = r.parentNode; n; n = n.parentNode) if (isW(n, "p")) return n === p;
    return false;
  });
}

function runFlag(r: Element, name: string): boolean {
  const el = child(child(r, "rPr"), name);
  return !!el && val(el) !== "0" && val(el) !== "false";
}

function describeParagraph(p: Element, id: number, region: Region, styles: StyleView, numbering: NumberingView): ParaItem {
  const pPr = child(p, "pPr");
  const style = paragraphStyle(p);
  const direct = child(pPr, "numPr");
  let numId: string | null;
  let ilvl: number;
  if (direct) {
    numId = val(child(direct, "numId"));
    ilvl = Number(val(child(direct, "ilvl")) ?? 0) || 0;
    if (!numId) [numId] = styles.numPr(style);
  } else {
    [numId, ilvl] = styles.numPr(style);
  }
  const text = textOf(p);
  const textRuns = ownRuns(p).filter((r) => children(r, "t").some((t) => (t.textContent ?? "").trim()));
  const sizes = ownRuns(p).map((r) => Number(val(child(child(r, "rPr"), "sz")))).filter((n) => n > 0);
  const outline = val(child(pPr, "outlineLvl"));
  return {
    type: "p",
    id,
    el: p,
    region,
    style,
    numId,
    ilvl,
    list: numbering.format(numId, ilvl),
    text,
    empty: isEmptyParagraph(p),
    hasDrawing: descendants(p, "drawing").length + descendants(p, "pict").length > 0,
    bold: textRuns.length > 0 && textRuns.every((r) => runFlag(r, "b")),
    caps: textRuns.length > 0 && textRuns.every((r) => runFlag(r, "caps")),
    shaded: !!child(pPr, "shd") && (attr(child(pPr, "shd"), "fill") ?? "auto") !== "auto",
    outlineLvl: outline !== null ? Number(outline) : null,
    sizePt: sizes.length ? Math.max(...sizes) / 2 : null,
  };
}

function describeTable(tbl: Element, id: number, region: Region): TableItem {
  const rows = children(tbl, "tr");
  const cellText = (tc: Element) => textOf(tc).replace(/\s+/g, " ").trim();
  const firstRow = rows[0] ? children(rows[0], "tc").map(cellText).join(" | ") : "";
  const preview = rows
    .slice(1, 3)
    .map((r) => children(r, "tc").map(cellText).join(" | "))
    .join(" / ");
  return {
    type: "t",
    id,
    el: tbl,
    region,
    rows: rows.length,
    cols: Math.max(0, ...rows.map((r) => children(r, "tc").length)),
    hasDrawing: descendants(tbl, "drawing").length + descendants(tbl, "pict").length > 0,
    firstRow: firstRow.slice(0, 160),
    preview: preview.slice(0, 160),
  };
}

// ---- regions ----

const SIGN_OFF = /^(yours (truly|sincerely|very truly)|sincerely|best regards|kind regards|regards|trace consulting group( ltd\.?)?)[,.]?$/i;
const LIMITATIONS = /^limitations\.?$/i;
const APPENDIX = /^appendix\b/i;

function hasSectPr(el: Element): boolean {
  return isW(el, "p") && !!child(child(el, "pPr"), "sectPr");
}

function isTocContent(el: Element): boolean {
  if (descendants(el, "pStyle").some((s) => /^TOC/i.test(val(s) ?? ""))) return true;
  return descendants(el, "instrText").some((t) => /\bTOC\b/.test(t.textContent ?? ""));
}

/**
 * Splits the body into regions. Only "main" and "limitations" are reformatted; the cover,
 * table of contents, signature block and appendices are left exactly as they are.
 */
export function assignRegions(body: Element): { el: Element; region: Region }[] {
  const els = elementChildren(body).filter((e) => wName(e) !== "sectPr");
  const regions: Region[] = new Array(els.length).fill("main");
  const sectIdx = els.map((e, i) => (hasSectPr(e) ? i : -1)).filter((i) => i >= 0);

  let mainStart = 0;
  const tocIdx = els.findIndex(isTocContent);
  if (tocIdx >= 0) {
    const tocEnd = sectIdx.find((i) => i >= tocIdx);
    mainStart = tocEnd !== undefined ? tocEnd + 1 : tocIdx + 1;
    const coverEnd = sectIdx.find((i) => i < tocIdx);
    for (let i = 0; i < mainStart; i++) regions[i] = coverEnd !== undefined && i <= coverEnd ? "cover" : "toc";
  } else if (sectIdx.length && !els.slice(0, sectIdx[0]).some((e) => isW(e, "p") && /^Heading\d$/.test(paragraphStyle(e)) && textOf(e).trim())) {
    mainStart = sectIdx[0] + 1;
    for (let i = 0; i < mainStart; i++) regions[i] = "cover";
  }

  const textAt = (i: number) => (isW(els[i], "p") ? textOf(els[i]).trim() : "");
  let sigStart = -1;
  let limStart = -1;
  let appendixStart = els.length;
  for (let i = mainStart; i < els.length; i++) {
    const t = textAt(i);
    if (sigStart < 0 && limStart < 0 && SIGN_OFF.test(t)) sigStart = i;
    if (limStart < 0 && LIMITATIONS.test(t)) limStart = i;
    if (APPENDIX.test(t)) {
      appendixStart = i;
      break;
    }
  }
  if (limStart >= 0) {
    // Appendices begin at the section break after the Limitations list.
    const brk = sectIdx.find((i) => i > limStart);
    if (brk !== undefined && brk < appendixStart) appendixStart = brk + 1;
  }

  for (let i = mainStart; i < els.length; i++) {
    if (i >= appendixStart) regions[i] = "appendix";
    else if (limStart >= 0 && i >= limStart) regions[i] = "limitations";
    else if (sigStart >= 0 && i >= sigStart) regions[i] = "signature";
  }
  return els.map((el, i) => ({ el, region: regions[i] }));
}

export const FORMATTED_REGIONS: Region[] = ["main", "limitations"];

/** Items (paragraphs and tables at body level) in the regions we reformat, in document order. */
export function extractItems(body: Element, styles: StyleView, numbering: NumberingView): Item[] {
  const items: Item[] = [];
  let id = 0;
  for (const { el, region } of assignRegions(body)) {
    if (!FORMATTED_REGIONS.includes(region)) continue;
    if (isW(el, "p")) items.push(describeParagraph(el, id++, region, styles, numbering));
    else if (isW(el, "tbl")) items.push(describeTable(el, id++, region));
  }
  return items;
}
