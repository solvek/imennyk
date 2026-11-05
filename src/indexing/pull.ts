// Writes the repository and the sources of a case into the case database, as typed rows given by
// the database the bank will be loaded into (Grapa reads them from its Postgres: `indexing:pull`),
// so the case database holds the real ones with their ids there.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { inTransaction } from "./db.ts";

export const pulledSchema = z.object({
  repositories: z.array(
    z.object({
      id: z.int(),
      type: z.string().min(1),
      name: z.string().min(1),
      abbr: z.string().nullable(),
      url: z.string().nullable(),
    }),
  ),
  sources: z.array(
    z.object({
      id: z.int(),
      repo: z.int().nullable(),
      type: z.string().min(1),
      period_from: z.string().nullable(),
      period_to: z.string().nullable(),
      title: z.string().min(1),
      callno: z.string().nullable(),
      url: z.string().nullable(),
    }),
  ),
});

export type Pulled = z.infer<typeof pulledSchema>;

/** Adds the repositories and sources; those already there (same id) are updated. */
export function savePulled(
  db: DatabaseSync,
  input: unknown,
): { repositories: number; sources: number } {
  const pulled = pulledSchema.parse(input);
  return inTransaction(db, () => {
    const repo = db.prepare(
      `insert into repository (id, type, name, abbr, url) values (?, ?, ?, ?, ?)
       on conflict (id) do update set type = excluded.type, name = excluded.name, abbr = excluded.abbr, url = excluded.url`,
    );
    for (const row of pulled.repositories) repo.run(row.id, row.type, row.name, row.abbr, row.url);
    const source = db.prepare(
      `insert into source (id, repo_id, type, period_from, period_to, title, callno, url)
       values (?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (id) do update set repo_id = excluded.repo_id, type = excluded.type,
         period_from = excluded.period_from, period_to = excluded.period_to,
         title = excluded.title, callno = excluded.callno, url = excluded.url`,
    );
    for (const row of pulled.sources) {
      source.run(
        row.id,
        row.repo,
        row.type,
        row.period_from,
        row.period_to,
        row.title,
        row.callno,
        row.url,
      );
    }
    return { repositories: pulled.repositories.length, sources: pulled.sources.length };
  });
}
