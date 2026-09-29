import { readFile } from "node:fs/promises";
import path from "node:path";
import { applyClassification, type ChangeEntry, type FormatSummary } from "./apply";
import { DocxPackage, FormatInputError } from "./docx-io";
import { StyleView, extractItems, type Item } from "./extract";
import { NumberingView, installTemplateLists, templateLists } from "./numbering";
import { heuristicClassification, type Classification } from "./roles";
import { syncStyles } from "./styles-sync";
import { assertSameContent, fingerprint } from "./verify";
import { child, elementChildren, isW, makeEl, type Document } from "./xml";

export type { ChangeEntry, FormatSummary } from "./apply";
export { FormatInputError } from "./docx-io";
export { ContentChangedError } from "./verify";
export type { Classification } from "./roles";

/** Decides the role of each paragraph/table. Throwing makes the pipeline fall back to heuristics. */
export type Classifier = (items: Item[]) => Promise<Classification>;

export interface FormatResult {
  buffer: Buffer;
  summary: FormatSummary;
  changes: ChangeEntry[];
  warnings: string[];
  classifiedBy: "claude" | "heuristic";
  model?: string;
}

let templateCache: Promise<DocxPackage> | null = null;
function loadTemplate(): Promise<DocxPackage> {
  templateCache ??= readFile(path.join(process.cwd(), "templates", "tcg-report-template.docx")).then((b) => DocxPackage.load(b));
  return templateCache;
}

// Settings children that must come after w:updateFields (ECMA-376 order).
const AFTER_UPDATE_FIELDS = [
  "hdrShapeDefaults", "footnotePr", "endnotePr", "compat", "docVars", "rsids", "mathPr", "attachedSchema", "themeFontLang",
  "clrSchemeMapping", "doNotIncludeSubdocsInStats", "doNotAutoCompressPictures", "forceUpgrade", "captions",
  "readModeInkLockDown", "smartTagType", "schemaLibrary", "shapeDefaults", "doNotEmbedSmartTags", "decimalSymbol", "listSeparator",
];

/** Asks Word to refresh the table of contents and other fields when the document is opened. */
function requestFieldUpdate(settings: Document): void {
  const root = settings.documentElement!;
  if (child(root, "updateFields")) return;
  const el = makeEl(settings, "updateFields", { val: "true" });
  const before = elementChildren(root).find((c) => AFTER_UPDATE_FIELDS.includes(c.localName ?? "") || c.namespaceURI?.includes("/math"));
  root.insertBefore(el, before ?? null);
}

export async function formatReport(input: Buffer | Uint8Array, opts: { classify?: Classifier } = {}): Promise<FormatResult> {
  const warnings: string[] = [];
  const [pkg, tpl] = await Promise.all([DocxPackage.load(input), loadTemplate()]);

  const doc = await pkg.xml("word/document.xml");
  const body = elementChildren(doc.documentElement!).find((e) => isW(e, "body"));
  if (!body) throw new FormatInputError("The document has no body.");
  if (!pkg.has("word/styles.xml")) throw new FormatInputError("The document has no styles part; open and re-save it in Word first.");
  if (!pkg.has("word/numbering.xml")) throw new FormatInputError("The document has no numbering part; it does not look like it was started from the TCG template.");

  const styles = await pkg.xml("word/styles.xml");
  const numbering = await pkg.xml("word/numbering.xml");
  const before = fingerprint(doc);

  const items = extractItems(body, new StyleView(styles), new NumberingView(numbering));
  if (!items.some((i) => i.type === "p" && !i.empty)) throw new FormatInputError("No report body was found to format.");
  if (!items.some((i) => i.region === "limitations")) warnings.push("No “Limitations” section was found; everything after the table of contents was treated as the report body.");

  let cls: Classification;
  if (opts.classify) {
    try {
      cls = await opts.classify(items);
    } catch (err) {
      warnings.push(`AI classification failed (${err instanceof Error ? err.message : "unknown error"}); rule-based formatting was used instead. Check headings and bullets closely.`);
      cls = heuristicClassification(items);
    }
  } else {
    cls = heuristicClassification(items);
  }

  const tplNumbering = await tpl.xml("word/numbering.xml");
  const lists = installTemplateLists(numbering, tplNumbering);
  const added = syncStyles(styles, await tpl.xml("word/styles.xml"), templateLists(tplNumbering).ids, lists);
  if (added.some((id) => id.startsWith("Text"))) warnings.push("This document was missing TCG text styles; they were added from the template.");

  const { summary, changes } = applyClassification(items, cls, lists);
  if (pkg.has("word/settings.xml")) requestFieldUpdate(await pkg.xml("word/settings.xml"));

  assertSameContent(before, fingerprint(doc), summary.emptyParagraphsRemoved);

  if (summary.reviewColoredRuns) warnings.push(`${summary.reviewColoredRuns} run(s) of red text were left as-is — they may be reviewer notes to resolve before issue.`);
  if (summary.highlightedRuns) warnings.push(`${summary.highlightedRuns} highlighted run(s) were left as-is — check for placeholders or notes before issue.`);
  if (summary.paragraphsKept) warnings.push(`${summary.paragraphsKept} paragraph(s) were left unchanged because their role was unclear.`);

  return { buffer: await pkg.save(), summary, changes, warnings, classifiedBy: cls.source, model: cls.model };
}
