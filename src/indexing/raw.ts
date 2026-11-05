// The full-size scans of a case: files in `raw/` of the case folder, kept locally, never committed.
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Names of the files in `raw/` of the case folder (none when the folder is missing). */
export function rawFiles(caseDir: string): string[] {
  const dir = join(caseDir, "raw");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .toSorted();
}

/** Deletes every file in `raw/` of the case folder and returns how many went. Folders stay. */
export function wipeRaw(caseDir: string): number {
  const files = rawFiles(caseDir);
  for (const name of files) rmSync(join(caseDir, "raw", name));
  return files.length;
}
