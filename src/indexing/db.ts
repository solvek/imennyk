// Opens the sqlite database of a case and brings its schema to the current version.
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

const MIGRATIONS_DIR = join(import.meta.dirname, "migrations");

/** Migration files `NNNN_name.sql`, in order; the schema version is the count applied. */
function migrationFiles(dir: string): string[] {
  const files = readdirSync(dir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .toSorted();
  // The schema version is the count of migrations applied, so a database made with one order of
  // files would be wrong under another: the numbers must be 0001, 0002 … without gaps or twins.
  files.forEach((file, i) => {
    if (Number(file.slice(0, 4)) !== i + 1) {
      throw new Error(
        `migrations must be numbered 1, 2, 3 … without gaps or duplicates: ${file} is the ${String(i + 1)}th`,
      );
    }
  });
  return files;
}

/** Latest schema version this code knows. */
export const SCHEMA_VERSION = migrationFiles(MIGRATIONS_DIR).length;

/** Runs a query and validates every row with `schema`. */
export function selectRows<T extends z.ZodType>(
  db: DatabaseSync,
  schema: T,
  sql: string,
  params: readonly (string | number | null)[] = [],
): z.infer<T>[] {
  return db
    .prepare(sql)
    .all(...params)
    .map((row) => schema.parse({ ...row }));
}

/** Applies the migrations the database has not seen yet; every one in its own transaction. */
export function migrate(db: DatabaseSync, dir: string = MIGRATIONS_DIR): void {
  const { user_version: current } = z
    .object({ user_version: z.number() })
    .parse({ ...db.prepare("pragma user_version").get() });
  const files = migrationFiles(dir);
  if (current > files.length) {
    throw new Error(
      `database has schema version ${String(current)}, newer than the code (${String(files.length)})`,
    );
  }
  // SQLite's way to rebuild a table others point at: foreign keys off (the pragma does nothing
  // inside a transaction), run the migration, check every reference, then switch them back on.
  // Deferred checks are not enough: dropping the old table counts its children as broken for good.
  const keys = z
    .object({ foreign_keys: z.number() })
    .parse({ ...db.prepare("pragma foreign_keys").get() }).foreign_keys;
  try {
    db.exec("pragma foreign_keys = off");
    files.slice(current).forEach((file, i) => {
      db.exec("begin");
      try {
        db.exec(readFileSync(join(dir, file), "utf8"));
        const broken = db.prepare("pragma foreign_key_check").all();
        if (broken.length > 0) {
          throw new Error(`${file} left ${String(broken.length)} broken references`);
        }
        db.exec(`pragma user_version = ${String(current + i + 1)}`);
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
    });
  } finally {
    db.exec(`pragma foreign_keys = ${keys === 0 ? "off" : "on"}`);
  }
}

/** Opens (and creates) the database at `path`, with foreign keys on and the schema current. */
export function openCaseDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("pragma foreign_keys = on");
  migrate(db);
  return db;
}

/** Runs `fn` in a transaction; any error rolls everything back. */
export function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("begin");
  try {
    const result = fn();
    db.exec("commit");
    return result;
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}
