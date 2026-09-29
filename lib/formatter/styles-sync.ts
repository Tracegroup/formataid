import { CAPTION_STYLE_XML, SYNCED_STYLES } from "./standards";
import type { TemplateLists } from "./numbering";
import { W, attr, child, descendants, elementChildren, parseXml, val, type Document, type Element } from "./xml";

function stylesById(doc: Document): Map<string, Element> {
  const map = new Map<string, Element>();
  for (const s of descendants(doc, "style")) {
    const id = attr(s, "styleId");
    if (id) map.set(id, s);
  }
  return map;
}

function putStyle(report: Document, existing: Map<string, Element>, source: Element): void {
  const root = report.documentElement!;
  const copy = report.importNode(source, true) as Element;
  const id = attr(copy, "styleId")!;
  const old = existing.get(id);
  if (old) root.replaceChild(copy, old);
  else root.appendChild(copy);
  existing.set(id, copy);
}

/**
 * Replaces the report's TCG style definitions (and document defaults) with the template's,
 * pointing the heading and list styles at the lists installed by installTemplateLists.
 * Returns the ids of styles that were missing from the report and had to be added.
 */
export function syncStyles(report: Document, tpl: Document, tplLists: TemplateLists, reportLists: TemplateLists): string[] {
  const root = report.documentElement!;
  const tplStyles = stylesById(tpl);
  const reportStyles = stylesById(report);
  const added: string[] = [];

  const tplDefaults = child(tpl.documentElement!, "docDefaults");
  if (tplDefaults) {
    const copy = report.importNode(tplDefaults, true) as Element;
    const old = child(root, "docDefaults");
    if (old) root.replaceChild(copy, old);
    else root.insertBefore(copy, elementChildren(root)[0] ?? null);
  }

  for (const id of SYNCED_STYLES) {
    const source = tplStyles.get(id);
    if (!source) continue;
    if (!reportStyles.has(id)) added.push(id);
    putStyle(report, reportStyles, source);
    for (const numId of descendants(reportStyles.get(id)!, "numId")) {
      const v = val(numId);
      if (v === tplLists.headingNumId) numId.setAttributeNS(W, "w:val", reportLists.headingNumId);
      else if (v === tplLists.bulletNumId) numId.setAttributeNS(W, "w:val", reportLists.bulletNumId);
    }
  }

  const caption = parseXml(CAPTION_STYLE_XML).documentElement!;
  if (!reportStyles.has("Caption")) added.push("Caption");
  putStyle(report, reportStyles, caption);
  return added;
}
