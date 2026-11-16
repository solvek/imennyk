// Which scans of a run are already in the bank. A second start of the same run reads only the
// scans that have no row yet, so a stopped run continues from the page it stopped on.

import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { selectRows } from "../indexing/db.ts";

const nameRow = z.object({ name: z.string() });
const idRow = z.object({ id: z.number() });

/**
 * The names of the scans this run has already written anything about: a record, a line, a place,
 * a doubt or a note on the scan itself. A title page counts once it has its note.
 */
export function readScanNames(db: DatabaseSync, runId: number): ReadonlySet<string> {
  const rows = selectRows(
    db,
    nameRow,
    `select distinct s.name as name from scan s
      where exists (select 1 from text_line t where t.run_id = ? and t.scan_id = s.id)
         or exists (select 1 from person p where p.run_id = ? and p.scan_id = s.id)
         or exists (select 1 from event e where e.run_id = ? and e.scan_id = s.id)
         or exists (select 1 from place pl where pl.run_id = ? and pl.scan_id = s.id)
         or exists (select 1 from doubt d where d.run_id = ? and d.scan_id = s.id)
         or exists (select 1 from attribute a where a.run_id = ? and a.scan_id = s.id)`,
    [runId, runId, runId, runId, runId, runId],
  );
  return new Set(rows.map((row) => row.name));
}

/**
 * The latest run of this model, and of this note when one is given. Continuing a book means that
 * run, not a new one: a new run would read the pages again.
 */
export function latestRun(
  db: DatabaseSync,
  model: string,
  note: string | undefined,
): number | undefined {
  const rows =
    note === undefined
      ? selectRows(db, idRow, "select id from run where model = ? order by id desc limit 1", [
          model,
        ])
      : selectRows(
          db,
          idRow,
          "select id from run where model = ? and note = ? order by id desc limit 1",
          [model, note],
        );
  return rows[0]?.id;
}
