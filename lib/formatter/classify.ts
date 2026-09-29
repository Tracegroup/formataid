import { getAiConfig } from "@/lib/ai-config";
import { generateJson } from "@/lib/llm";
import type { Item, ParaItem, TableItem } from "./extract";
import type { Classifier } from "./index";
import { PARA_ROLES, TABLE_KINDS, classifyParagraph, classifyTable, type ParaDecision, type ParaRole, type TableDecision, type TableKind } from "./roles";

const SYSTEM = `You classify the structure of engineering condition-assessment reports written by Trace Consulting Group (TCG) so a program can apply TCG's Word styles. You never rewrite text; you only label each block.

Report structure: numbered headings (1., 1.1, 1.1.1 …) such as Executive Summary, Introduction, Methodology, Observations, Analysis, Discussion, Options, Recommendations, Limitations, each followed by body paragraphs, bulleted lists, tables and figure/table captions.

Each input line describes one block with its CURRENT Word formatting, which is often wrong — authors type headings as bold normal text, make bullets from body styles, and so on. Judge by content and context, not just the style name.

Paragraph roles:
- H1–H5: a heading at that outline level. Top-level report sections are H1; their subsections H2; and so on. Keep the author's existing heading levels unless clearly wrong. Short bold lines that introduce a list ("Suite Deficiencies", "Key advantages:", "Fire Alarm Panel/System") are NOT headings — they are BODY.
- BODY: a normal paragraph of text, including lead-in lines and sub-labels.
- BULLET: an item in a bulleted (unordered) list. listLevel is its nesting depth: 0 for top-level items, 1 for items nested under another item (e.g. items that elaborate a preceding "…including the following:" item), 2 for deeper.
- NUMBERED: an item in a numbered or lettered list where the numbers matter (steps, referenced items). Use only if the block is currently numbered (list=numbered).
- CAPTION: a table or figure caption ("Table 2 – Base Load Breakdown", "Figure 1: …").
- CLOSING: the closing statement before the sign-off ("We trust the above is satisfactory…").
- KEEP: anything that should not be restyled (equations, a stray fragment you cannot place).
listLevel must be 0 for every role except BULLET and NUMBERED.

Table kinds:
- DATA: a table of text/numbers (cost breakdowns, load tables, option comparisons). headerRows is how many leading rows are column headings (usually 1; 0 if none).
- PHOTO: a grid of photographs with captions.
- KEEP: a layout table, signature block, callout box or anything that is not a data table.

Return every id you are given exactly once.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["paragraphs", "tables"],
  properties: {
    paragraphs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "role", "listLevel"],
        properties: {
          id: { type: "integer" },
          role: { type: "string", enum: [...PARA_ROLES] },
          listLevel: { type: "integer" },
        },
      },
    },
    tables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "headerRows"],
        properties: {
          id: { type: "integer" },
          kind: { type: "string", enum: [...TABLE_KINDS] },
          headerRows: { type: "integer" },
        },
      },
    },
  },
} as const;

interface ClaudeOutput {
  paragraphs: { id: number; role: ParaRole; listLevel: number }[];
  tables: { id: number; kind: TableKind; headerRows: number }[];
}

/** Paragraphs Claude needs to see: anything with text. Empty/text-less blocks are decided by rule. */
function needsClaude(item: Item): boolean {
  return item.type === "t" || (!item.empty && item.text.trim().length > 0);
}

function describe(item: Item): string {
  if (item.type === "t") return describeTable(item);
  return describePara(item);
}

function describePara(p: ParaItem): string {
  const flags = [
    `style=${p.style}`,
    p.list ? `list=${p.list} ilvl=${p.ilvl}` : null,
    p.bold ? "bold" : null,
    p.caps ? "caps" : null,
    p.shaded ? "shaded" : null,
    p.outlineLvl !== null ? `outline=${p.outlineLvl}` : null,
    p.sizePt ? `${p.sizePt}pt` : null,
    p.hasDrawing ? "image" : null,
    p.region === "limitations" ? "section=Limitations" : null,
  ].filter(Boolean);
  const text = p.text.replace(/\s+/g, " ").trim();
  return `P${p.id} [${flags.join(", ")}] ${text.length > 220 ? text.slice(0, 220) + "…" : text}`;
}

function describeTable(t: TableItem): string {
  return `T${t.id} [table ${t.rows}x${t.cols}${t.hasDrawing ? ", images" : ""}] first row: ${t.firstRow || "(empty)"}${t.preview ? ` / next rows: ${t.preview}` : ""}`;
}

const CHUNK = 300;
const OVERLAP = 12;

export function claudeClassifier(who: { userId: string; email?: string; jobId?: string }): Classifier {
  return async (items) => {
    const config = await getAiConfig();
    const relevant = items.filter(needsClaude);
    const chunks: { context: Item[]; target: Item[] }[] = [];
    for (let i = 0; i < relevant.length; i += CHUNK) {
      chunks.push({ context: relevant.slice(Math.max(0, i - OVERLAP), i), target: relevant.slice(i, i + CHUNK) });
    }

    const results = await Promise.all(
      chunks.map(({ context, target }) => {
        const lead = context.length
          ? `For context only (already classified elsewhere — do not return these):\n${context.map(describe).join("\n")}\n\nClassify these blocks:\n`
          : "Classify these blocks:\n";
        return generateJson<ClaudeOutput>({
          config,
          system: SYSTEM,
          context: lead + target.map(describe).join("\n"),
          instruction: "Return the role of every P id and the kind of every T id listed above.",
          schema: SCHEMA as unknown as Record<string, unknown>,
          effort: "low",
          maxTokens: 32000,
          usage: { ...who, task: "classify_report" },
        });
      })
    );

    // Start from the rules so any id Claude skipped still gets a sensible decision.
    const paragraphs = new Map<number, ParaDecision>();
    const tables = new Map<number, TableDecision>();
    const paraIds = new Set<number>();
    const tableIds = new Set<number>();
    for (const item of items) {
      if (item.type === "t") {
        tables.set(item.id, classifyTable(item));
        tableIds.add(item.id);
      } else if (!item.empty) {
        paragraphs.set(item.id, classifyParagraph(item));
        if (needsClaude(item)) paraIds.add(item.id);
      }
    }
    let answered = 0;
    for (const { output } of results) {
      for (const p of output.paragraphs ?? []) {
        if (!paraIds.has(p.id) || !PARA_ROLES.includes(p.role)) continue;
        paragraphs.set(p.id, { role: p.role, listLevel: p.role === "BULLET" || p.role === "NUMBERED" ? p.listLevel : 0 });
        answered++;
      }
      for (const t of output.tables ?? []) {
        if (!tableIds.has(t.id) || !TABLE_KINDS.includes(t.kind)) continue;
        tables.set(t.id, { kind: t.kind, headerRows: Math.max(0, Math.min(3, t.headerRows)) });
      }
    }
    if (paraIds.size && answered < paraIds.size * 0.8) {
      throw new Error(`Claude returned roles for only ${answered} of ${paraIds.size} paragraphs`);
    }
    return { paragraphs, tables, source: "claude", model: results[0]?.model ?? config.claudeModel };
  };
}
