import { DOMParser, XMLSerializer, type Document, type Element, type Node } from "@xmldom/xmldom";

export const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

export type { Document, Element };

export function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "text/xml");
}

export function serializeXml(doc: Document): string {
  const out = new XMLSerializer().serializeToString(doc);
  return out.startsWith("<?xml") ? out : XML_DECL + out;
}

const ELEMENT_NODE = 1;

/** Local name of a w: element, or null for anything else. */
export function wName(node: Node | null | undefined): string | null {
  if (!node || node.nodeType !== ELEMENT_NODE) return null;
  const el = node as Element;
  return el.namespaceURI === W ? el.localName : null;
}

export function isW(node: Node | null | undefined, name: string): node is Element {
  return wName(node) === name;
}

export function elementChildren(el: Element): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === ELEMENT_NODE) out.push(n as Element);
  return out;
}

export function child(el: Element | null | undefined, name: string): Element | null {
  if (!el) return null;
  for (let n = el.firstChild; n; n = n.nextSibling) if (isW(n, name)) return n as Element;
  return null;
}

export function children(el: Element, name: string): Element[] {
  return elementChildren(el).filter((c) => isW(c, name));
}

/** All w:<name> descendants (document order). */
export function descendants(el: Element | Document, name: string): Element[] {
  return Array.from(el.getElementsByTagNameNS(W, name)) as Element[];
}

export function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  return el.getAttributeNS(W, name) ?? el.getAttribute(`w:${name}`);
}

export function val(el: Element | null | undefined): string | null {
  return attr(el, "val");
}

export function makeEl(doc: Document, name: string, attrs: Record<string, string | number> = {}): Element {
  const el = doc.createElementNS(W, `w:${name}`);
  for (const [k, v] of Object.entries(attrs)) el.setAttributeNS(W, `w:${k}`, String(v));
  return el;
}

export function remove(el: Element | null | undefined): void {
  el?.parentNode?.removeChild(el);
}

/** Removes the named direct children; returns how many were removed. */
export function removeChildren(el: Element | null | undefined, names: readonly string[]): number {
  if (!el) return 0;
  let n = 0;
  for (const c of elementChildren(el)) {
    const name = wName(c);
    if (name && names.includes(name)) {
      el.removeChild(c);
      n++;
    }
  }
  return n;
}

/**
 * Inserts (or replaces) a w:<name> child so that children stay in the schema order
 * given by `order`. Elements not listed in `order` are treated as coming after all
 * listed ones, except those that must stay last (handled by callers' order lists).
 */
export function setChild(parent: Element, newEl: Element, order: readonly string[]): Element {
  const name = wName(newEl)!;
  const existing = child(parent, name);
  if (existing) {
    parent.replaceChild(newEl, existing);
    return newEl;
  }
  const rank = order.indexOf(name);
  for (const c of elementChildren(parent)) {
    const r = order.indexOf(wName(c) ?? "");
    if (r > rank) {
      parent.insertBefore(newEl, c);
      return newEl;
    }
  }
  parent.appendChild(newEl);
  return newEl;
}

/** Gets or creates a container child (pPr, rPr, tblPr, tcPr) as the first child of el. */
export function ensureFirst(el: Element, name: string): Element {
  const existing = child(el, name);
  if (existing) return existing;
  const created = makeEl(el.ownerDocument!, name);
  el.insertBefore(created, el.firstChild);
  return created;
}

// ---- Schema orders (ECMA-376) for the property containers we edit ----

export const PPR_ORDER = [
  "pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr", "widowControl", "numPr", "suppressLineNumbers",
  "pBdr", "shd", "tabs", "suppressAutoHyphens", "kinsoku", "wordWrap", "overflowPunct", "topLinePunct", "autoSpaceDE",
  "autoSpaceDN", "bidi", "adjustRightInd", "snapToGrid", "spacing", "ind", "contextualSpacing", "mirrorIndents",
  "suppressOverlap", "jc", "textDirection", "textAlignment", "textboxTightWrap", "outlineLvl", "divId", "cnfStyle",
  "rPr", "sectPr", "pPrChange",
] as const;

export const RPR_ORDER = [
  "ins", "del", "moveFrom", "moveTo", "rStyle", "rFonts", "b", "bCs", "i", "iCs", "caps", "smallCaps", "strike", "dstrike",
  "outline", "shadow", "emboss", "imprint", "noProof", "snapToGrid", "vanish", "webHidden", "color", "spacing", "w",
  "kern", "position", "sz", "szCs", "highlight", "u", "effect", "bdr", "shd", "fitText", "vertAlign", "rtl", "cs", "em",
  "lang", "eastAsianLayout", "specVanish", "oMath", "rPrChange",
] as const;

export const TBLPR_ORDER = [
  "tblStyle", "tblpPr", "tblOverlap", "bidiVisual", "tblStyleRowBandSize", "tblStyleColBandSize", "tblW", "jc",
  "tblCellSpacing", "tblInd", "tblBorders", "shd", "tblLayout", "tblCellMar", "tblLook", "tblCaption", "tblDescription",
  "tblPrChange",
] as const;

export const TCPR_ORDER = [
  "cnfStyle", "tcW", "gridSpan", "hMerge", "vMerge", "tcBorders", "shd", "noWrap", "tcMar", "textDirection", "tcFitText",
  "vAlign", "hideMark", "headers", "cellIns", "cellDel", "cellMerge", "tcPrChange",
] as const;

/** Closest ancestor w:<name> of a node (excluding the node itself). */
export function closest(node: Node, name: string): Element | null {
  for (let p = node.parentNode; p; p = p.parentNode) if (isW(p, name)) return p as Element;
  return null;
}

/** Visible text of a paragraph/element: w:t, w:tab, w:br — excluding deleted text. */
export function textOf(el: Element): string {
  let out = "";
  const walk = (node: Node) => {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      const name = wName(n);
      if (name === "t") out += n.textContent ?? "";
      else if (name === "tab") out += "\t";
      else if (name === "br" || name === "cr") out += "\n";
      else if (name === "del" || name === "moveFrom" || name === "pPr" || name === "rPr") continue;
      else if (n.nodeType === ELEMENT_NODE) walk(n);
    }
  };
  walk(el);
  return out;
}
