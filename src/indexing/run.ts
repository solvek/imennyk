// Runs: one reading pass of a model over scans, and its metafile.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { stringify } from "yaml";
import { z } from "zod";
import { selectRows } from "./db.ts";

export interface RunInfo {
  /** ISO time of the start; passed in so the result does not depend on the clock. */
  readonly startedAt: string;
  /** Id of the model that reads, e.g. `claude-opus-5-5`. */
  readonly model: string;
  readonly session?: string;
  readonly effort?: string;
  /** Git sha of the reading procedure, to compare runs fairly. */
  readonly procedureSha?: string;
  readonly note?: string;
}

/** Creates a run and returns its id. */
export function startRun(db: DatabaseSync, info: RunInfo): number {
  const { lastInsertRowid } = db
    .prepare(
      "insert into run (started_at, model, session, effort, procedure_sha, note) values (?, ?, ?, ?, ?, ?)",
    )
    .run(
      info.startedAt,
      info.model,
      info.session ?? null,
      info.effort ?? null,
      info.procedureSha ?? null,
      info.note ?? null,
    );
  return Number(lastInsertRowid);
}

const runRow = z.object({
  started_at: z.string(),
  model: z.string(),
  session: z.string().nullable(),
  effort: z.string().nullable(),
  procedure_sha: z.string().nullable(),
  note: z.string().nullable(),
});
const countRow = z.object({ n: z.number() });

/** File name of the metafile of a run: `run-<datetime>.yaml`, safe for any file system. */
export function runFileName(startedAt: string): string {
  return `run-${startedAt.replaceAll(/[^0-9A-Za-z]+/g, "-").replace(/-+$/, "")}.yaml`;
}

/** Writes the metafile of run `runId` into `dir`; `wer` stays empty until the sample is checked. */
export function writeRunReport(db: DatabaseSync, runId: number, dir: string): string {
  const run = selectRows(db, runRow, "select * from run where id = ?", [runId])[0];
  if (run === undefined) throw new Error(`unknown run ${String(runId)}`);
  const scans = selectRows(
    db,
    countRow,
    `select count(*) as n from (
       select scan_id from text_line where run_id = ?1 union select scan_id from person where run_id = ?1
       union select scan_id from event where run_id = ?1 union select scan_id from place where run_id = ?1
       union select scan_id from doubt where run_id = ?1)`,
    [runId],
  )[0]?.n;
  const doubts = selectRows(db, countRow, "select count(*) as n from doubt where run_id = ?", [
    runId,
  ])[0]?.n;
  const path = join(dir, runFileName(run.started_at));
  writeFileSync(
    path,
    stringify({
      model: run.model,
      session: run.session,
      effort: run.effort,
      procedure_sha: run.procedure_sha,
      started_at: run.started_at,
      scans_processed: scans ?? 0,
      doubts: doubts ?? 0,
      wer: null,
      note: run.note,
    }),
  );
  return path;
}
