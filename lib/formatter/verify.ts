import { descendants, type Document } from "./xml";

/** Everything that counts as content. Formatting may change; none of this may. */
export interface ContentFingerprint {
  text: string;
  counts: Record<string, number>;
}

const COUNTED = [
  "tbl", "tr", "tc", "drawing", "pict", "object", "ins", "del", "commentRangeStart", "commentReference",
  "bookmarkStart", "footnoteReference", "endnoteReference", "sectPr", "fldChar", "hyperlink",
];

export function fingerprint(doc: Document): ContentFingerprint {
  const text = [...descendants(doc, "t"), ...descendants(doc, "delText"), ...descendants(doc, "instrText")]
    .map((t) => t.textContent ?? "")
    .join("\u0000");
  const counts: Record<string, number> = { p: descendants(doc, "p").length };
  for (const name of COUNTED) counts[name] = descendants(doc, name).length;
  return { text, counts };
}

export class ContentChangedError extends Error {}

/** Throws if anything other than formatting (and removed empty paragraphs) differs. */
export function assertSameContent(before: ContentFingerprint, after: ContentFingerprint, emptyParagraphsRemoved: number): void {
  if (before.text !== after.text) {
    let i = 0;
    while (i < before.text.length && before.text[i] === after.text[i]) i++;
    const around = (s: string) => JSON.stringify(s.slice(Math.max(0, i - 30), i + 30).replace(/\u0000/g, ""));
    throw new ContentChangedError(`Text changed during formatting near ${around(before.text)} → ${around(after.text)}.`);
  }
  for (const [name, n] of Object.entries(before.counts)) {
    const expected = name === "p" ? n - emptyParagraphsRemoved : n;
    if (after.counts[name] !== expected) {
      throw new ContentChangedError(`Document structure changed during formatting (${name}: ${expected} expected, ${after.counts[name]} found).`);
    }
  }
}
