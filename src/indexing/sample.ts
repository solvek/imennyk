// The fixed sample of places with a surname that a human checks to measure reading errors.
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { SAMPLE_SIZE } from "./constants.ts";
import { inTransaction, selectRows } from "./db.ts";

const idRow = z.object({ id: z.number() });

function hashOf(seed: string, id: number): string {
  return createHash("sha256")
    .update(`${seed}:${String(id)}`)
    .digest("hex");
}

/** Ids of the name mentions in the sample, in sample order (empty before it is built). */
export function sampleMentions(db: DatabaseSync): number[] {
  return selectRows(
    db,
    z.object({ name_mention_id: z.number() }),
    "select name_mention_id from sample order by rank",
  ).map((row) => row.name_mention_id);
}

/**
 * Builds the sample once: `size` surname mentions with a box, picked by the order of a hash of
 * `seed` and the mention id (all of them when there are fewer). A sample that exists is returned
 * as it is, so every run of the case is checked against the same places.
 */
export function buildSample(db: DatabaseSync, seed: string, size: number = SAMPLE_SIZE): number[] {
  const existing = sampleMentions(db);
  if (existing.length > 0) return existing;
  const candidates = selectRows(
    db,
    idRow,
    "select id from name_mention where kind = 'surname' and box_id is not null",
  );
  const picked = candidates
    .map((row) => ({ id: row.id, hash: hashOf(seed, row.id) }))
    .toSorted((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : a.id - b.id))
    .slice(0, size);
  inTransaction(db, () => {
    const insert = db.prepare("insert into sample (name_mention_id, rank) values (?, ?)");
    picked.forEach((item, i) => insert.run(item.id, i + 1));
  });
  return picked.map((item) => item.id);
}
