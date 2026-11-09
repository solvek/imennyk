// Thin command line over the indexing library: parses arguments, reads files, prints.
import { execFileSync } from "node:child_process";
import { stringify } from "yaml";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { dumpCaseDb } from "./dump.ts";
import { caseHints, formatHints, parseNameKind } from "./hints.ts";
import { openCaseDb, selectRows } from "./db.ts";
import { compactToReading } from "./compact.ts";
import { ingestReading } from "./ingest.ts";
import { mergeBanks } from "./merge.ts";
import { runSummary, startRun } from "./run.ts";
import { buildSample } from "./sample.ts";
import { addScans } from "./scans.ts";

const USAGE = `usage: pnpm indexing <command> <case dir> [options]
  init                                create the case database
  scans <scans.json>                  add scans: [{name, url, width, height, md5?}]
  run-start --model M [--session S] [--effort E] [--sha SHA] [--note N]   print the run id
  ingest <run id> <reading.json>      write the reading of one scan
  sample <run id>                     build (once per run) and print the sample of its surname places
  hints [--kind given|patronymic|surname]   print the dictionary and the names already read in this case
  run-report <run id>                 print what the bank says about the run (counts, error rate)
  compact <run id> <file>             read a scan from the compact notation (docs/document-types/confession.md) and ingest it
  merge <source case dir>             add the bank of another case dir to this one (scans must differ)
  dump <file.sqlite>                  text dump for git diff (the first argument is the file)`;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function procedureSha(): string | undefined {
  try {
    return execFileSync(
      "git",
      ["log", "-1", "--format=%H", "--", "docs/scan-extraction.md"],
      // The procedure is in this repository, whatever folder the tool runs in.
      { encoding: "utf8", cwd: join(import.meta.dirname, "../..") },
    ).trim();
  } catch {
    return undefined;
  }
}

function main(argv: string[]): void {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      model: { type: "string" },
      session: { type: "string" },
      effort: { type: "string" },
      sha: { type: "string" },
      note: { type: "string" },
      kind: { type: "string" },
    },
  });
  const [command, caseDir, arg] = positionals;
  if (command === undefined || caseDir === undefined) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }
  if (command === "dump") {
    process.stdout.write(dumpCaseDb(caseDir));
    return;
  }
  const db = openCaseDb(join(caseDir, "case.sqlite"));
  const seed = basename(caseDir);
  switch (command) {
    case "init":
      db.prepare("insert or ignore into meta (key, value) values ('sample_seed', ?)").run(seed);
      console.log(`case database ready: ${join(caseDir, "case.sqlite")}`);
      return;
    case "scans":
      console.log(`added ${String(addScans(db, readJson(requireArg(arg, "scans.json"))))} scans`);
      return;
    case "run-start": {
      if (values.model === undefined) throw new Error("--model is required");
      const sha = values.sha ?? procedureSha();
      const id = startRun(db, {
        startedAt: new Date().toISOString(),
        model: values.model,
        ...(values.session === undefined ? {} : { session: values.session }),
        ...(values.effort === undefined ? {} : { effort: values.effort }),
        ...(sha === undefined ? {} : { procedureSha: sha }),
        ...(values.note === undefined ? {} : { note: values.note }),
      });
      console.log(id);
      return;
    }
    case "ingest": {
      const file = positionals[3];
      console.log(
        JSON.stringify(
          ingestReading(
            db,
            Number(requireArg(arg, "run id")),
            readJson(requireArg(file, "reading.json")),
          ),
        ),
      );
      return;
    }
    case "sample": {
      const stored = selectRows(
        db,
        z.object({ value: z.string() }),
        "select value from meta where key = 'sample_seed'",
      )[0];
      const ids = buildSample(db, stored?.value ?? seed, runIdOf(arg));
      console.log(`sample: ${String(ids.length)} places`);
      return;
    }
    case "compact": {
      const runId = Number(requireArg(arg, "run id"));
      const file = requireArg(positionals[3], "compact file");
      // Counters continue from the last serial numbers this run has written.
      const counter = (gender: string): number =>
        selectRows(
          db,
          z.object({ n: z.number() }),
          `select coalesce(max(cast(a.value as integer)), 0) as n from attribute a
             join person p on p.id = a.person_id
            where a.type = 'serial' and p.run_id = ? and p.gender = ?`,
          [runId, gender],
        )[0]?.n ?? 0;
      const { reading, summary } = compactToReading(readFileSync(file, "utf8"), {
        start: { m: counter("male"), f: counter("female") },
      });
      const result = ingestReading(db, runId, reading);
      console.log(JSON.stringify({ summary, result }));
      return;
    }
    case "merge": {
      const source = join(requireArg(arg, "source case dir"), "case.sqlite");
      openCaseDb(source).close(); // brings the source to the current schema
      const result = mergeBanks(db, source);
      console.log(JSON.stringify(result));
      return;
    }
    case "hints": {
      const kind = parseNameKind(values.kind);
      process.stdout.write(formatHints(caseHints(db, kind === undefined ? {} : { kind })));
      return;
    }
    case "run-report":
      process.stdout.write(stringify(runSummary(db, Number(requireArg(arg, "run id")))));
      return;
    default:
      console.log(USAGE);
      process.exitCode = 1;
  }
}

function runIdOf(value: string | undefined): number {
  const id = Number(requireArg(value, "run id"));
  if (!Number.isInteger(id) || id < 1)
    throw new Error(`run id must be a whole number: ${String(value)}`);
  return id;
}

function requireArg(value: string | undefined, name: string): string {
  if (value === undefined) throw new Error(`missing ${name}`);
  return value;
}

main(process.argv.slice(2));
