// The fixed sample of places with a surname that a human checks to measure reading errors; every
// run of a case has its own.
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { SAMPLE_SIZE } from "./constants.ts";
import { inTransaction, selectRows } from "./db.ts";

const idRow = z.object({ id: z.number() });

function hashOf(seed: string, runId: number, id: number): string {
  return createHash("sha256")
    .update(`${seed}:${String(runId)}:${String(id)}`)
    .digest("hex");
}

/** Ids of the name mentions in the sample of a run, in sample order (empty before it is built). */
export function sampleMentions(db: DatabaseSync, runId: number): number[] {
  return selectRows(
    db,
    z.object({ name_mention_id: z.number() }),
    "select name_mention_id from sample where run_id = ? order by rank",
    [runId],
  ).map((row) => row.name_mention_id);
}

/**
 * Builds the sample of run `runId` once: `size` of its surname mentions with a box, picked by the
 * order of a hash of `seed`, the run and the mention id (all of them when there are fewer). The
 * sample of the run that exists is returned as it is; samples of other runs are not looked at.
 */
export function buildSample(
  db: DatabaseSync,
  seed: string,
  runId: number,
  size: number = SAMPLE_SIZE,
): number[] {
  if (selectRows(db, idRow, "select id from run where id = ?", [runId]).length === 0) {
    throw new Error(`unknown run ${String(runId)}`);
  }
  const existing = sampleMentions(db, runId);
  if (existing.length > 0) return existing;
  const candidates = selectRows(
    db,
    idRow,
    "select id from name_mention where kind = 'surname' and box_id is not null and run_id = ?",
    [runId],
  );
  if (candidates.length === 0) {
    throw new Error(`run ${String(runId)} has no surname with a box to build a sample from`);
  }
  const picked = candidates
    .map((row) => ({ id: row.id, hash: hashOf(seed, runId, row.id) }))
    .toSorted((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : a.id - b.id))
    .slice(0, size);
  inTransaction(db, () => {
    const insert = db.prepare(
      "insert into sample (run_id, name_mention_id, rank) values (?, ?, ?)",
    );
    picked.forEach((item, i) => insert.run(runId, item.id, i + 1));
  });
  return picked.map((item) => item.id);
}
