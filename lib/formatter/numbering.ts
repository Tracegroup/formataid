import { W, attr, child, children, descendants, elementChildren, isW, makeEl, remove, val, type Document, type Element } from "./xml";

export type ListFormat = "bullet" | "numbered";

/** Read-only view of numbering.xml used to tell bullets from numbered lists. */
export class NumberingView {
  private numToAbstract = new Map<string, string>();
  private overrides = new Map<string, Map<string, string>>(); // numId -> ilvl -> numFmt
  private abstractFmt = new Map<string, Map<string, string>>(); // abstractId -> ilvl -> numFmt

  constructor(doc: Document | null) {
    if (!doc) return;
    for (const a of descendants(doc, "abstractNum")) {
      const levels = new Map<string, string>();
      for (const lvl of children(a, "lvl")) levels.set(attr(lvl, "ilvl") ?? "0", val(child(lvl, "numFmt")) ?? "decimal");
      this.abstractFmt.set(attr(a, "abstractNumId") ?? "", levels);
    }
    for (const n of descendants(doc, "num")) {
      const id = attr(n, "numId") ?? "";
      this.numToAbstract.set(id, val(child(n, "abstractNumId")) ?? "");
      const ov = new Map<string, string>();
      for (const o of children(n, "lvlOverride")) {
        const fmt = val(child(child(o, "lvl"), "numFmt"));
        if (fmt) ov.set(attr(o, "ilvl") ?? "0", fmt);
      }
      if (ov.size) this.overrides.set(id, ov);
    }
  }

  format(numId: string | null, ilvl: number): ListFormat | null {
    if (!numId || numId === "0") return null;
    const lvl = String(ilvl);
    const levels = this.abstractFmt.get(this.numToAbstract.get(numId) ?? "");
    // A level the list does not define renders like its first level.
    const fmt = this.overrides.get(numId)?.get(lvl) ?? levels?.get(lvl) ?? levels?.get("0");
    if (!fmt || fmt === "none") return null;
    return fmt === "bullet" ? "bullet" : "numbered";
  }
}

function findAbstractLinkedTo(doc: Document, styleId: string): Element | null {
  for (const a of descendants(doc, "abstractNum")) {
    if (children(a, "lvl").some((lvl) => val(child(lvl, "pStyle")) === styleId)) return a;
  }
  return null;
}

function numIdFor(doc: Document, abstractId: string): string | null {
  for (const n of descendants(doc, "num")) {
    if (val(child(n, "abstractNumId")) === abstractId && children(n, "lvlOverride").length === 0) return attr(n, "numId");
  }
  return null;
}

function randomHex8(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(16).toUpperCase().padStart(8, "0");
}

export interface TemplateLists {
  headingNumId: string;
  bulletNumId: string;
}

/** The template's heading and bullet list definitions, found by the styles they are linked to. */
export function templateLists(tpl: Document): { heading: Element; bullet: Element; ids: TemplateLists } {
  const heading = findAbstractLinkedTo(tpl, "Heading1");
  const bullet = findAbstractLinkedTo(tpl, "ListParagraph");
  if (!heading || !bullet) throw new Error("Template numbering is missing the heading or bullet list.");
  const headingNumId = numIdFor(tpl, attr(heading, "abstractNumId")!);
  const bulletNumId = numIdFor(tpl, attr(bullet, "abstractNumId")!);
  if (!headingNumId || !bulletNumId) throw new Error("Template numbering has no num for the heading or bullet list.");
  return { heading, bullet, ids: { headingNumId, bulletNumId } };
}

const LINKED_STYLES = new Set(["Heading1", "Heading2", "Heading3", "Heading4", "Heading5", "Heading6", "Heading7", "Heading8", "Heading9", "ListParagraph"]);

/**
 * Adds fresh copies of the template's heading and bullet lists to the report's numbering
 * and returns their numIds. Old lists stay (numbered lists may still reference them) but are
 * unlinked from the heading/list styles so Word does not see two lists claiming one style.
 */
export function installTemplateLists(report: Document, tpl: Document): TemplateLists {
  const root = report.documentElement!;
  const { heading, bullet } = templateLists(tpl);

  for (const a of descendants(report, "abstractNum")) {
    for (const lvl of children(a, "lvl")) {
      const ps = child(lvl, "pStyle");
      if (ps && LINKED_STYLES.has(val(ps) ?? "")) remove(ps);
    }
  }

  const abstractIds = descendants(report, "abstractNum").map((a) => Number(attr(a, "abstractNumId")) || 0);
  const numIds = descendants(report, "num").map((n) => Number(attr(n, "numId")) || 0);
  let nextAbstract = Math.max(-1, ...abstractIds) + 1;
  let nextNum = Math.max(0, ...numIds) + 1;

  const add = (source: Element): string => {
    const copy = report.importNode(source, true) as Element;
    const abstractId = String(nextAbstract++);
    copy.setAttributeNS(W, "w:abstractNumId", abstractId);
    // A unique nsid keeps Word from merging this list with the report's own copies of it.
    const nsid = child(copy, "nsid");
    if (nsid) nsid.setAttributeNS(W, "w:val", randomHex8());
    // Abstract numbering must precede all w:num elements.
    const firstNum = elementChildren(root).find((c) => isW(c, "num") || isW(c, "numIdMacAtCleanup"));
    root.insertBefore(copy, firstNum ?? null);

    const numId = String(nextNum++);
    const num = makeEl(report, "num", { numId });
    num.appendChild(makeEl(report, "abstractNumId", { val: abstractId }));
    const cleanup = elementChildren(root).find((c) => isW(c, "numIdMacAtCleanup"));
    root.insertBefore(num, cleanup ?? null);
    return numId;
  };

  return { headingNumId: add(heading), bulletNumId: add(bullet) };
}
