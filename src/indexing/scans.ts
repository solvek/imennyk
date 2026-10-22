import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { inTransaction } from "./db.ts";

export const scanListSchema = z.array(
  z.strictObject({
    /** Name of the scan; becomes the page of the citation. */
    name: z.string().min(1),
    url: z.string().min(1),
    width: z.int().positive(),
    height: z.int().positive(),
    md5: z.string().length(32).optional(),
  }),
);

/** Adds the scans of a case; a scan that already exists (same name) is skipped. Returns how many were added. */
export function addScans(db: DatabaseSync, input: unknown): number {
  const scans = scanListSchema.parse(input);
  return inTransaction(db, () => {
    const insert = db.prepare(
      "insert or ignore into scan (name, url, width, height, md5) values (?, ?, ?, ?, ?)",
    );
    let added = 0;
    for (const scan of scans) {
      added += Number(
        insert.run(scan.name, scan.url, scan.width, scan.height, scan.md5 ?? null).changes,
      );
    }
    return added;
  });
}
