import type { Item, ParaItem, TableItem } from "./extract";

export const PARA_ROLES = ["H1", "H2", "H3", "H4", "H5", "BODY", "BULLET", "NUMBERED", "CAPTION", "CLOSING", "KEEP"] as const;
export type ParaRole = (typeof PARA_ROLES)[number];

export const TABLE_KINDS = ["DATA", "PHOTO", "KEEP"] as const;
export type TableKind = (typeof TABLE_KINDS)[number];

export interface ParaDecision {
  role: ParaRole;
  /** 0-based nesting level for BULLET / NUMBERED. */
  listLevel: number;
}

export interface TableDecision {
  kind: TableKind;
  headerRows: number;
}

export interface Classification {
  paragraphs: Map<number, ParaDecision>;
  tables: Map<number, TableDecision>;
  source: "claude" | "heuristic";
  model?: string;
}

const HEADING_STYLE = /^Heading([1-5])$/;
const CAPTION_TEXT = /^(table|figure|photo|image)\s+\d+\s*[:.\-–—]/i;
const CLOSING_TEXT = /^we trust the above/i;

/** Rule-based classification: used when Claude is unavailable, and as the baseline in tests. */
export function classifyParagraph(p: ParaItem): ParaDecision {
  const text = p.text.trim();
  const heading = HEADING_STYLE.exec(p.style);
  if (heading) return { role: `H${heading[1]}` as ParaRole, listLevel: 0 };
  // Page breaks, images and field ends carry no text to style.
  if (!text) return { role: "KEEP", listLevel: 0 };
  if (p.style === "Caption" || CAPTION_TEXT.test(text)) return { role: "CAPTION", listLevel: 0 };
  if (CLOSING_TEXT.test(text)) return { role: "CLOSING", listLevel: 0 };
  // A "fake" heading: typed as normal text but given a heading's look and an outline level.
  if (p.outlineLvl !== null && p.outlineLvl <= 4 && text.length < 120) {
    return { role: `H${p.outlineLvl + 1}` as ParaRole, listLevel: 0 };
  }
  if (p.bold && p.caps && p.shaded && text.length < 120) return { role: "H1", listLevel: 0 };
  if (p.list === "bullet") return { role: "BULLET", listLevel: Math.min(p.ilvl, 2) };
  if (p.list === "numbered") return { role: "NUMBERED", listLevel: Math.min(p.ilvl, 2) };
  if (p.style === "ListParagraph") return { role: "BULLET", listLevel: 0 };
  return { role: "BODY", listLevel: 0 };
}

export function classifyTable(t: TableItem): TableDecision {
  if (t.hasDrawing) return { kind: "PHOTO", headerRows: 0 };
  if (t.rows < 2) return { kind: "KEEP", headerRows: 0 };
  return { kind: "DATA", headerRows: 1 };
}

export function heuristicClassification(items: Item[]): Classification {
  const paragraphs = new Map<number, ParaDecision>();
  const tables = new Map<number, TableDecision>();
  for (const item of items) {
    if (item.type === "p") {
      if (!item.empty) paragraphs.set(item.id, classifyParagraph(item));
    } else tables.set(item.id, classifyTable(item));
  }
  return { paragraphs, tables, source: "heuristic" };
}
