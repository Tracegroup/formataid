/**
 * Formats a report from the command line — for testing the engine without the web app.
 *
 *   npm run format -- "samples/My Report.docx"            # rule-based classification
 *   npm run format -- "samples/My Report.docx" --claude   # Claude classification (needs .env.local)
 *   add --changes to print every change made
 *
 * Writes "<name> - Formatted.docx" next to the input and prints the summary.
 */
import { readFile, writeFile } from "node:fs/promises";
import { formatReport } from "../lib/formatter";

async function main() {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith("--"));
  if (!input) throw new Error('Usage: npm run format -- "path/to/report.docx" [--claude]');
  let classify;
  if (args.includes("--claude")) {
    process.loadEnvFile?.(".env.local");
    const { claudeClassifier } = await import("../lib/formatter/classify");
    classify = claudeClassifier({ userId: "cli", email: "cli" });
  }
  const started = Date.now();
  const result = await formatReport(await readFile(input), { classify });
  const out = input.replace(/\.docx$/i, "") + " - Formatted.docx";
  await writeFile(out, result.buffer);
  console.log(`Wrote ${out} in ${((Date.now() - started) / 1000).toFixed(1)}s (classified by ${result.classifiedBy}${result.model ? `, ${result.model}` : ""})`);
  if (args.includes("--changes")) {
    let section = "";
    for (const c of result.changes) {
      if (c.section !== section) console.log(`\n## ${(section = c.section) || "Start of report"}`);
      console.log(`  [${c.kind}] ${c.text}  —  ${c.from} → ${c.to}`);
      for (const d of c.details) console.log(`      ${d}`);
    }
    console.log("");
  }
  console.log(`${result.changes.length} changes`);
  console.table(result.summary);
  for (const w of result.warnings) console.log(`! ${w}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
