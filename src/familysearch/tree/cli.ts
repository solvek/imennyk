// pnpm familysearch:tree <command> <case dir> …
//   fetch  --root ID [--root ID …] [--allow ID …]   ancestors of the roots → raw/tree-<ID>.json
//   ingest --model M                                 every raw/tree-*.json not yet read → case.sqlite
//   enter  --actor A [--places file] (--dry-run | --apply)   the case → the well
//   places --actor A --places file (--dry-run | --apply)     make the places asked for, put places into entered events
// Thin: parses arguments, reads and writes files, prints. The logic is in the modules beside.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { z } from "zod";
import { databaseUrl } from "../../../core/db/env.ts";
import { saveMapping } from "../../indexing/enter/mapping.ts";
import { PLACE_TYPES } from "../../indexing/enums.ts";
import { findWithin } from "../../places/match.ts";
import { openCaseDb, selectRows } from "../../indexing/db.ts";
import { startRun } from "../../indexing/run.ts";
import { withFamilySearch } from "./browser.ts";
import { crawlTrees } from "./crawl.ts";
import { ingestTree } from "./ingest.ts";
import { enterTree, planTreeEntry } from "./enter.ts";
import { treeBundleSchema } from "./model.ts";
import { applyPlaces, placeDecisionsSchema } from "./places.ts";

const USAGE = `usage: pnpm familysearch:tree <fetch|ingest|enter> <case dir> [options]
  fetch  --root ID [--root ID …] [--allow ID …]
  ingest --model M
  enter  --actor A [--places file] (--dry-run | --apply)
  places --actor A --places file (--dry-run | --apply)`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string", multiple: true, default: [] },
    allow: { type: "string", multiple: true, default: [] },
    model: { type: "string" },
    actor: { type: "string" },
    places: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    apply: { type: "boolean", default: false },
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
      writeFileSync(join(caseDir, "raw", `tree-${bundle.root}.json`), JSON.stringify(bundle, null, 1));
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
    const db = openCaseDb(join(caseDir, "case.sqlite"));
    db.prepare("insert or ignore into meta (key, value) values ('kind', 'familysearch-tree')").run();
    const done = new Set(
      selectRows(db, z.object({ note: z.string() }), "select note from run where note is not null").map(
        (r) => r.note,
      ),
    );
    const files = readdirSync(join(caseDir, "raw")).filter((f) => /^tree-.+\.json$/.test(f)).toSorted();
    for (const file of files) {
      const bundle = treeBundleSchema.parse(JSON.parse(readFileSync(join(caseDir, "raw", file), "utf8")));
      const note = `FamilySearch tree of ${bundle.root}, fetched ${bundle.fetchedAt}`;
      if (done.has(note)) {
        console.log(`${file}: already read`);
        continue;
      }
      const run = startRun(db, { startedAt: new Date().toISOString(), model: values.model, note });
      console.log(`${file}: run ${String(run)} ${JSON.stringify(ingestTree(db, run, bundle))}`);
    }
    break;
  }
  case "enter": {
    if (values.actor === undefined || values.apply === values["dry-run"]) {
      console.error(USAGE);
      process.exit(2);
    }
    const original = join(caseDir, "case.sqlite");
    const db = new DatabaseSync(original, { readOnly: true });
    const plan = planTreeEntry(db);
    db.close();
    const placeMap: Record<string, number> = {};
    const decisions = placeDecisionsSchema.parse(
      values.places === undefined ? {} : JSON.parse(readFileSync(values.places, "utf8")),
    );
    for (const [fsId, decision] of Object.entries(decisions)) {
      if (typeof decision !== "number") {
        throw new Error(`place ${fsId} is still to be created: run \`places\` first`);
      }
      placeMap[fsId] = decision;
    }
    console.log(
      `plan: ${String(plan.persons.length)} persons, ${String(plan.events.length)} events, ${String(plan.ties.length)} ties, ${String(plan.places.length)} places`,
    );
    const client = new pg.Client({ connectionString: databaseUrl() });
    await client.connect();
    try {
      const result = await enterTree(client, plan, {
        actor: values.actor,
        places: placeMap,
        dryRun: values["dry-run"],
      });
      console.log(`${values.apply ? "entered" : "dry run, rolled back"}: ${JSON.stringify(result.counts)}, ${String(result.known)} persons known`);
      console.log(`bounds: ${JSON.stringify(result.bounds)}`);
      for (const place of result.unmapped) {
        const candidates = await findWithin(client, {
          names: [place.name.split(",")[0]?.trim() ?? place.name],
          types: PLACE_TYPES,
          within: null,
        });
        console.log(`place ${String(place.fsId)} «${place.name}» not mapped; candidates: ${candidates.join(", ") || "none"}`);
      }
      if (values.apply) {
        console.log(`ddb_map: ${String(saveMapping(original, result.mapping))} rows`);
      }
    } finally {
      await client.end();
    }
    break;
  }
  case "places": {
    if (values.actor === undefined || values.places === undefined || values.apply === values["dry-run"]) {
      console.error(USAGE);
      process.exit(2);
    }
    const decisions = placeDecisionsSchema.parse(JSON.parse(readFileSync(values.places, "utf8")));
    const db = new DatabaseSync(join(caseDir, "case.sqlite"), { readOnly: true });
    const client = new pg.Client({ connectionString: databaseUrl() });
    await client.connect();
    try {
      const result = await applyPlaces(client, db, decisions, {
        actor: values.actor,
        dryRun: values["dry-run"],
      });
      console.log(
        `${values.apply ? "done" : "dry run, rolled back"}: ${String(Object.keys(result.created).length)} places created, ${String(result.events)} events got a place`,
      );
      console.log(`created: ${JSON.stringify(result.created)}`);
      if (values.apply) {
        // A created place is an id from now on, so a second run finds it by the id.
        const resolved = { ...decisions, ...result.created };
        writeFileSync(values.places, `${JSON.stringify(resolved, null, 2)}\n`);
      }
    } finally {
      db.close();
      await client.end();
    }
    break;
  }
  default:
    console.error(USAGE);
    process.exit(2);
}
