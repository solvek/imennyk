// Runs: one reading pass of a model over scans; the bank keeps everything about it.
import type { DatabaseSync } from "node:sqlite";
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
  sample_size: z.number().nullable(),
  sample_errors: z.number().nullable(),
  wer: z.number().nullable(),
});
const countRow = z.object({ n: z.number() });

/** The result of checking the sample of a run: wrong places among all, and their share in %. */
export interface RunErrorRate {
  readonly size: number;
  readonly errors: number;
  readonly percent: number;
}

/** What the bank says about a run: who read, how much, and how well (once the sample is checked). */
export interface RunSummary {
  readonly model: string;
  readonly session: string | null;
  readonly effort: string | null;
  readonly procedureSha: string | null;
  readonly startedAt: string;
  readonly note: string | null;
  /** Scans the run wrote anything on. */
  readonly scansProcessed: number;
  readonly doubts: number;
  /** Null until the sample of the run is checked. */
  readonly errorRate: RunErrorRate | null;
}

function errorRateOf(row: z.infer<typeof runRow>): RunErrorRate | null {
  if (row.wer === null || row.sample_errors === null || row.sample_size === null) return null;
  return { size: row.sample_size, errors: row.sample_errors, percent: row.wer };
}

function loadRun(db: DatabaseSync, runId: number): z.infer<typeof runRow> {
  const run = selectRows(db, runRow, "select * from run where id = ?", [runId])[0];
  if (run === undefined) throw new Error(`unknown run ${String(runId)}`);
  return run;
}

/** The summary of run `runId`, counted from the rows of the bank. */
export function runSummary(db: DatabaseSync, runId: number): RunSummary {
  const run = loadRun(db, runId);
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
  return {
    model: run.model,
    session: run.session,
    effort: run.effort,
    procedureSha: run.procedure_sha,
    startedAt: run.started_at,
    note: run.note,
    scansProcessed: scans ?? 0,
    doubts: doubts ?? 0,
    errorRate: errorRateOf(run),
  };
}

/** Writes the error rate of run `runId` into the bank; the rest of the run does not change. */
export function writeRunErrorRate(db: DatabaseSync, runId: number, rate: RunErrorRate): void {
  loadRun(db, runId);
  db.prepare("update run set wer = ?, sample_errors = ?, sample_size = ? where id = ?").run(
    rate.percent,
    rate.errors,
    rate.size,
    runId,
  );
}

/** The error rate recorded for run `runId`, or null when its sample is not checked yet. */
export function readRunErrorRate(db: DatabaseSync, runId: number): RunErrorRate | null {
  return errorRateOf(loadRun(db, runId));
}
