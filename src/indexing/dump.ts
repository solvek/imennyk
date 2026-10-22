// Text dump of a case database for `git diff` (git textconv): one line per row, tables by name.
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { selectRows } from "./db.ts";

/** Dumps all tables of the database at `path`, read-only. */
export function dumpCaseDb(path: string): string {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const tables = selectRows(
      db,
      z.object({ name: z.string() }),
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
    );
    const lines: string[] = [];
    for (const { name } of tables) {
      lines.push(`-- ${name}`);
      for (const row of db.prepare(`select * from "${name}" order by 1, 2`).all()) {
        lines.push(JSON.stringify({ ...row }));
      }
    }
    return `${lines.join("\n")}\n`;
  } finally {
    db.close();
  }
}
