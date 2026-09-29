import { describe, expect, it } from "vitest";
import { applyClassification } from "./apply";
import { StyleView, assignRegions, extractItems, type ParaItem } from "./extract";
import { NumberingView } from "./numbering";
import { classifyParagraph, heuristicClassification } from "./roles";
import { ContentChangedError, assertSameContent, fingerprint } from "./verify";
import { W, child, descendants, elementChildren, isW, parseXml, serializeXml, val } from "./xml";

const LISTS = { headingNumId: "90", bulletNumId: "91" };

const NUMBERING = `<w:numbering xmlns:w="${W}">
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

function doc(bodyXml: string) {
  const d = parseXml(`<w:document xmlns:w="${W}"><w:body>${bodyXml}<w:sectPr/></w:body></w:document>`);
  const body = elementChildren(d.documentElement!).find((e) => isW(e, "body"))!;
  return { d, body };
}

const p = (text: string, pPr = "", rPr = "") => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const style = (id: string) => `<w:pStyle w:val="${id}"/>`;
const bullet = (numId = "1", ilvl = 0) => `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`;

function format(bodyXml: string) {
  const { d, body } = doc(bodyXml);
  const before = fingerprint(d);
  const items = extractItems(body, new StyleView(null), new NumberingView(parseXml(NUMBERING)));
  const { summary, changes } = applyClassification(items, heuristicClassification(items), LISTS);
  assertSameContent(before, fingerprint(d), summary.emptyParagraphsRemoved);
  const paras = descendants(d, "p");
  return { d, summary, changes, paras, xml: serializeXml(d) };
}

const styleOf = (p: Element) => val(child(child(p, "pPr"), "pStyle"));
type Element = ReturnType<typeof descendants>[number];

describe("paragraph rules", () => {
  it("turns a hand-formatted heading into Heading1 and strips its overrides", () => {
    const { paras, summary } = format(
      p("Executive Summary", `${bullet("2")}<w:shd w:val="clear" w:color="auto" w:fill="1B325A"/><w:ind w:left="1440"/><w:outlineLvl w:val="0"/>`, `<w:rFonts w:ascii="Inter Black"/><w:b/><w:caps/><w:color w:val="FFFFFF"/>`)
    );
    expect(styleOf(paras[0])).toBe("Heading1");
    const pPr = child(paras[0], "pPr")!;
    for (const name of ["numPr", "shd", "ind", "outlineLvl"]) expect(child(pPr, name)).toBeNull();
    const rPr = child(descendants(paras[0], "r")[0], "rPr")!;
    expect(elementChildren(rPr)).toHaveLength(0);
    expect(summary.fakeHeadingsFixed).toBe(1);
  });

  it("styles body text by the level of the heading above it", () => {
    const { paras } = format(p("Observations", style("Heading1")) + p("Generator", style("Heading2")) + p("The generator is old.", `<w:ind w:left="720"/><w:jc w:val="both"/>`));
    expect(styleOf(paras[2])).toBe("Text2");
    expect(child(child(paras[2], "pPr"), "ind")).toBeNull();
  });

  it("puts bullets on the TCG list, indented to the section", () => {
    const { paras } = format(p("Discussion", style("Heading1")) + p("Option", style("Heading2")) + p("First item", style("Normal") + bullet("1", 1)));
    const pPr = child(paras[2], "pPr")!;
    expect(styleOf(paras[2])).toBe("ListParagraph");
    expect(val(child(child(pPr, "numPr"), "numId"))).toBe("91");
    expect(val(child(child(pPr, "numPr"), "ilvl"))).toBe("1");
    expect(child(pPr, "ind")!.getAttribute("w:left")).toBe(String(1296 + 360 * 2));
  });

  it("keeps a numbered list's own numbering", () => {
    const { paras, summary } = format(p("Steps", style("Heading1")) + p("Do this", bullet("2")));
    expect(val(child(child(child(paras[1], "pPr"), "numPr"), "numId"))).toBe("2");
    expect(summary.numberedItems).toBe(1);
  });

  it("keeps bold, italics and superscripts but removes fonts, sizes and colours", () => {
    const { paras } = format(p("30th", "", `<w:rFonts w:ascii="Arial"/><w:b/><w:i/><w:color w:val="18345D"/><w:sz w:val="24"/><w:vertAlign w:val="superscript"/>`));
    const names = elementChildren(child(descendants(paras[0], "r")[0], "rPr")!).map((e) => e.localName);
    expect(names).toEqual(["b", "i", "vertAlign"]);
  });

  it("keeps red text, highlights and symbol fonts, and reports review marks", () => {
    const { paras, summary } = format(
      p("check", "", `<w:color w:val="FF0000"/><w:highlight w:val="yellow"/>`) + p("x", "", `<w:rFonts w:ascii="Wingdings" w:hAnsi="Wingdings"/>`)
    );
    expect(elementChildren(child(descendants(paras[0], "r")[0], "rPr")!).map((e) => e.localName)).toEqual(["color", "highlight"]);
    expect(child(child(descendants(paras[1], "r")[0], "rPr"), "rFonts")).not.toBeNull();
    expect(summary.reviewColoredRuns).toBe(1);
    expect(summary.highlightedRuns).toBe(1);
  });

  it("leaves tracked changes in place", () => {
    const ins = `<w:p><w:pPr><w:ind w:left="700"/><w:pPrChange w:id="1" w:author="A"><w:pPr/></w:pPrChange></w:pPr><w:ins w:id="2" w:author="A"><w:r><w:rPr><w:sz w:val="30"/><w:rPrChange w:id="3" w:author="A"><w:rPr/></w:rPrChange></w:rPr><w:t>new text</w:t></w:r></w:ins><w:del w:id="4" w:author="A"><w:r><w:delText>old</w:delText></w:r></w:del></w:p>`;
    const { paras } = format(ins);
    expect(styleOf(paras[0])).toBe("Text1");
    expect(descendants(paras[0], "ins")).toHaveLength(1);
    expect(descendants(paras[0], "del")).toHaveLength(1);
    expect(descendants(paras[0], "pPrChange")).toHaveLength(1);
    expect(descendants(paras[0], "rPrChange")).toHaveLength(1);
    expect(descendants(paras[0], "sz")).toHaveLength(0);
  });
});

describe("change log", () => {
  it("records each changed paragraph with its section, before/after style and removed overrides", () => {
    const { changes } = format(
      p("Observations", style("Heading1")) +
        p("Generator", style("Heading2")) +
        p("Already correct.", style("Text2")) +
        p("Needs fixing.", `<w:ind w:left="720"/>`, `<w:sz w:val="24"/>`) +
        p("Item", bullet("1"))
    );
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ kind: "body", section: "Observations › Generator", text: "Needs fixing.", from: "Normal", to: "Text 2" });
    expect(changes[0].details).toEqual(["Removed manual indent", "Removed manual font size on the text"]);
    expect(changes[1]).toMatchObject({ kind: "bullet", from: "Normal (bulleted)", to: "TCG bullet" });
    expect(changes[1].details).toContain("Changed to the TCG bullet");
  });
});

describe("empty paragraphs", () => {
  it("removes blank lines but keeps page breaks, bookmarks and table separators", () => {
    const tbl = `<w:tbl><w:tblGrid><w:gridCol w:w="100"/></w:tblGrid><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>`;
    const { summary, paras, d } = format(
      p("Intro", style("Heading1")) +
        "<w:p/><w:p><w:pPr><w:ind w:left='5'/></w:pPr></w:p>" +
        `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` +
        `<w:p><w:bookmarkStart w:id="0" w:name="_Toc1"/><w:bookmarkEnd w:id="0"/></w:p>` +
        tbl +
        "<w:p/>" +
        tbl +
        p("End")
    );
    expect(summary.emptyParagraphsRemoved).toBe(2);
    expect(descendants(d, "tbl")).toHaveLength(2);
    expect(paras.length).toBeGreaterThan(0);
  });
});

describe("tables", () => {
  it("applies TCG shading, header row and section indent, and fits the width", () => {
    const cell = (t: string) => `<w:tc><w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr>${p(t)}</w:tc>`;
    const tbl = `<w:tbl><w:tblPr><w:jc w:val="center"/></w:tblPr><w:tblGrid><w:gridCol w:w="6000"/><w:gridCol w:w="6000"/></w:tblGrid><w:tr>${cell("Item")}${cell("Cost")}</w:tr><w:tr>${cell("Pump")}${cell("$5")}</w:tr></w:tbl>`;
    const { d, summary } = format(p("Costs", style("Heading2")) + tbl);
    const t = descendants(d, "tbl")[0];
    const tblPr = child(t, "tblPr")!;
    expect(val(child(tblPr, "tblStyle"))).toBe("TableGrid");
    expect(child(tblPr, "jc")).toBeNull();
    expect(child(tblPr, "tblInd")!.getAttribute("w:w")).toBe("1415");
    const fills = descendants(t, "shd").map((s) => s.getAttribute("w:fill"));
    expect(fills).toEqual(["CCE7F8", "CCE7F8", "EDF7FD", "EDF7FD"]);
    const width = descendants(t, "gridCol").reduce((s, g) => s + Number(g.getAttribute("w:w")), 0);
    expect(width).toBeLessThanOrEqual(10770 - 1415);
    expect(child(child(descendants(t, "tr")[0], "trPr"), "tblHeader")).not.toBeNull();
    expect(summary.tablesResized).toBe(1);
  });
});

describe("regions", () => {
  it("leaves cover, TOC, signature and appendices alone", () => {
    const sect = `<w:p><w:pPr><w:sectPr/></w:pPr></w:p>`;
    const { body } = doc(
      p("COVER") + sect + p("Contents", style("TOCHeading")) + sect + p("Intro", style("Heading1")) + p("We trust the above is satisfactory.") + p("Yours truly,") + p("Name") + p("Limitations", style("Heading1")) + p("No testing.", style("ListParagraph")) + sect + p("Appendix 1 : Photographs", style("Heading1"))
    );
    const regions = assignRegions(body).map((r) => r.region);
    expect(regions).toEqual(["cover", "cover", "toc", "toc", "main", "main", "signature", "signature", "limitations", "limitations", "limitations", "appendix"]);
  });
});

describe("heuristics", () => {
  const para = (over: Partial<ParaItem>): ParaItem => ({
    type: "p", id: 0, el: null as never, region: "main", style: "Normal", numId: null, ilvl: 0, list: null, text: "Text", empty: false,
    hasDrawing: false, bold: false, caps: false, shaded: false, outlineLvl: null, sizePt: null, ...over,
  });
  it("recognizes captions and the closing line", () => {
    expect(classifyParagraph(para({ text: "Table 2 - Base Load" })).role).toBe("CAPTION");
    expect(classifyParagraph(para({ text: "We trust the above is satisfactory." })).role).toBe("CLOSING");
    expect(classifyParagraph(para({ style: "Heading3" })).role).toBe("H3");
  });
});

describe("verify", () => {
  it("rejects any text change", () => {
    const a = fingerprint(doc(p("Hello")).d);
    const b = fingerprint(doc(p("Hellp")).d);
    expect(() => assertSameContent(a, b, 0)).toThrow(ContentChangedError);
  });
});
