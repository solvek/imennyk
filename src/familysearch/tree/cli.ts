// pnpm familysearch:tree <command> <case dir> …
//   fetch  --root ID [--root ID …] [--allow ID …]   ancestors of the roots → raw/tree-<ID>.json
//   ingest --model M                                 every raw/tree-*.json not yet read → case.sqlite
// Loading the case into a database is the job of that database's own tools (Grapa: `familysearch:tree enter`).
// Thin: parses arguments, reads and writes files, prints. The logic is in the modules beside.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { requireOperator } from "../../credits/local.ts";
import { openCaseDb, selectRows } from "../../indexing/db.ts";
import { startRun } from "../../indexing/run.ts";
import { withFamilySearch } from "./browser.ts";
import { crawlTrees } from "./crawl.ts";
import { ingestTree } from "./ingest.ts";
import { treeBundleSchema } from "./model.ts";

const USAGE = `usage: pnpm familysearch:tree <fetch|ingest> <case dir> [options]
  fetch  --root ID [--root ID …] [--allow ID …]
  ingest --model M`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string", multiple: true, default: [] },
    allow: { type: "string", multiple: true, default: [] },
    model: { type: "string" },
  },
});
const [command, caseDir] = positionals;
if (command === undefined || caseDir === undefined) {
  console.error(USAGE);
  process.exit(2);
}

switch (command) {
  case "fetch": {
    const [first] = values.root;
    if (first === undefined) throw new Error("--root is required");
    const now = new Date();
    const bundles = await withFamilySearch(first, (fetcher) =>
      crawlTrees(fetcher, values.root, {
        referenceYear: now.getUTCFullYear(),
        fetchedAt: now.toISOString(),
        allow: new Set(values.allow),
      }),
    );
    mkdirSync(join(caseDir, "raw"), { recursive: true });
    for (const bundle of bundles) {
      writeFileSync(
        join(caseDir, "raw", `tree-${bundle.root}.json`),
        JSON.stringify(bundle, null, 1),
      );
      const reasons = Object.groupBy(bundle.excluded, (e) => e.reason);
      console.log(
        `${bundle.root}: ${String(bundle.persons.length)} persons, kept out: ` +
          `${String(reasons.living?.length ?? 0)} living, ${String(reasons.unknown?.length ?? 0)} unknown`,
      );
    }
    break;
  }
  case "ingest": {
    if (values.model === undefined) throw new Error("--model is required");
    const operator = requireOperator();
    const db = openCaseDb(join(caseDir, "case.sqlite"));
    db.prepare(
      "insert or ignore into meta (key, value) values ('kind', 'familysearch-tree')",
    ).run();
    const done = new Set(
      selectRows(
        db,
        z.object({ note: z.string() }),
        "select note from run where note is not null",
      ).map((r) => r.note),
    );
    const files = readdirSync(join(caseDir, "raw"))
      .filter((f) => /^tree-.+\.json$/.test(f))
      .toSorted();
    for (const file of files) {
      const bundle = treeBundleSchema.parse(
        JSON.parse(readFileSync(join(caseDir, "raw", file), "utf8")),
      );
      const note = `FamilySearch tree of ${bundle.root}, fetched ${bundle.fetchedAt}`;
      if (done.has(note)) {
        console.log(`${file}: already read`);
        continue;
      }
      const run = startRun(db, {
        startedAt: new Date().toISOString(),
        model: values.model,
        operator,
        note,
      });
      console.log(`${file}: run ${String(run)} ${JSON.stringify(ingestTree(db, run, bundle))}`);
    }
    break;
  }
  default:
    console.error(USAGE);
    process.exit(2);
}
