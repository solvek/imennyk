// Merges one bank into another: one archival case is one bank, so parishes read into
// separate banks are put together afterwards. Ids of the source are shifted past those of the
// target; every reference (foreign keys, `ddb_map`, sample ranks) shifts with them.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { inTransaction, selectRows } from "./db.ts";

export interface MergeResult {
  /** Rows added per table. */
  readonly added: Readonly<Record<string, number>>;
  /** Dictionary entries and other rows of the source dropped because the target has them. */
  readonly skipped: Readonly<Record<string, number>>;
}

/** Tables whose rows are matched by content instead of being added with shifted ids. */
const SHARED = ["repository", "source"] as const;
/** `ddb_map.kind` → the table whose ids it holds (`citation` is the scan). */
const MAP_KIND_TABLE: Readonly<Record<string, string>> = {
  person: "person",
  event: "event",
  tie: "tie",
  place: "place",
  citation: "scan",
};

const nameRow = z.object({ name: z.string() });
const columnRow = z.object({ name: z.string(), pk: z.number() });
const foreignKeyRow = z.object({ from: z.string(), table: z.string() });

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`unexpected identifier: ${name}`);
  return name;
}

function tableNames(db: DatabaseSync, schema: string): string[] {
  return selectRows(
    db,
    nameRow,
    `select name from ${schema}.sqlite_master where type = 'table' and name not like 'sqlite_%' order by name`,
  ).map((row) => row.name);
}

function columnsOf(db: DatabaseSync, schema: string, table: string): string[] {
  return selectRows(
    db,
    columnRow,
    `select name, pk from pragma_table_info('${table}', '${schema}')`,
  ).map((row) => row.name);
}

function scalar(db: DatabaseSync, sql: string): number {
  return selectRows(db, z.object({ n: z.number() }), sql)[0]?.n ?? 0;
}

/**
 * Adds everything of the bank at `sourcePath` to `target`. Both must have the current schema.
 * The target keeps its `meta`; scans must have different names; repositories and sources that
 * the target already has are not added again; dictionary entries it has are kept as they are.
 */
export function mergeBanks(target: DatabaseSync, sourcePath: string): MergeResult {
  target.prepare("attach database ? as src").run(sourcePath);
  try {
    const version = (schema: string): number =>
      z.object({ user_version: z.number() }).parse({
        ...target.prepare(`pragma ${schema}.user_version`).get(),
      }).user_version;
    if (version("src") !== version("main")) {
      throw new Error("the banks have different schema versions: open both with the tool first");
    }
    return inTransaction(target, () => mergeAttached(target));
  } finally {
    target.exec("detach database src");
  }
}

function mergeAttached(db: DatabaseSync): MergeResult {
  db.exec("pragma defer_foreign_keys = on");
  const tables = tableNames(db, "main").filter((t) => t !== "meta");
  const shared = new Set<string>(SHARED);
  const offset = new Map<string, number>();
  for (const table of tables) {
    if (shared.has(table) || table === "ddb_map") continue;
    offset.set(table, scalar(db, `select coalesce(max(id), 0) as n from main.${ident(table)}`));
  }

  const clash = scalar(
    db,
    "select count(*) as n from src.scan s join main.scan m on m.name = s.name",
  );
  if (clash > 0) throw new Error(`${String(clash)} scans of the source are already in the target`);

  const added: Record<string, number> = {};
  const skipped: Record<string, number> = {};

  // Repositories and sources: matched by content; ids of new ones come after the target's own.
  const repoMap = mergeShared(db, "repository", [], added, skipped, new Map());
  mergeShared(db, "source", ["repo_id"], added, skipped, repoMap);

  // Tables in dependency order: parents first.
  const order = dependencyOrder(
    db,
    tables.filter((t) => !shared.has(t) && t !== "ddb_map"),
  );
  for (const table of order) {
    const columns = columnsOf(db, "main", table);
    const parents = new Map(
      selectRows(
        db,
        foreignKeyRow,
        `select "from", "table" from pragma_foreign_key_list('${table}', 'main')`,
      ).map((row) => [row.from, row.table] as const),
    );
    const own = offset.get(table) ?? 0;
    const select = columns.map((column) => {
      const quoted = `"${ident(column)}"`;
      if (column === "id") return `${quoted} + ${String(own)}`;
      const parent = parents.get(column);
      const shift = parent === undefined ? undefined : offset.get(parent);
      if (shift !== undefined) return `${quoted} + ${String(shift)}`;
      if (table === "sample" && column === "rank") {
        const base = scalar(db, "select coalesce(max(rank), 0) as n from main.sample");
        return `${quoted} + ${String(base)}`;
      }
      return quoted;
    });
    const verb = table === "dict_entry" ? "insert or ignore" : "insert";
    const before = scalar(db, `select count(*) as n from main.${table}`);
    const total = scalar(db, `select count(*) as n from src.${table}`);
    db.exec(
      `${verb} into main.${table} (${columns.map((c) => `"${c}"`).join(", ")})
       select ${select.join(", ")} from src.${table} order by id`,
    );
    const now = scalar(db, `select count(*) as n from main.${table}`) - before;
    added[table] = now;
    if (now < total) skipped[table] = total - now;
  }

  // ddb_map: local ids shift with the table they name.
  const mapBefore = scalar(db, "select count(*) as n from main.ddb_map");
  for (const [kind, table] of Object.entries(MAP_KIND_TABLE)) {
    db.prepare(
      `insert or ignore into main.ddb_map (kind, local_id, ddb_id)
       select kind, local_id + ?, ddb_id from src.ddb_map where kind = ?`,
    ).run(offset.get(table) ?? 0, kind);
  }
  added.ddb_map = scalar(db, "select count(*) as n from main.ddb_map") - mapBefore;

  const broken = db.prepare("pragma foreign_key_check").all();
  if (broken.length > 0) throw new Error(`merge left ${String(broken.length)} broken references`);
  return { added, skipped };
}

/** Parents before children, by the foreign keys of the current schema. */
function dependencyOrder(db: DatabaseSync, tables: readonly string[]): string[] {
  const parentsOf = new Map(
    tables.map((table) => [
      table,
      selectRows(
        db,
        foreignKeyRow,
        `select "from", "table" from pragma_foreign_key_list('${table}', 'main')`,
      )
        .map((row) => row.table)
        .filter((parent) => parent !== table && tables.includes(parent)),
    ]),
  );
  const done: string[] = [];
  const visit = (table: string, trail: readonly string[]): void => {
    if (done.includes(table)) return;
    // A cycle (person ↔ event) is left to deferred foreign keys: the order inside it is free.
    if (trail.includes(table)) return;
    for (const parent of parentsOf.get(table) ?? []) visit(parent, [...trail, table]);
    done.push(table);
  };
  for (const table of tables) visit(table, []);
  return done;
}

/** Adds the rows of `table` the target lacks (same values apart from ids); returns old id → new id. */
function mergeShared(
  db: DatabaseSync,
  table: string,
  refColumns: readonly string[],
  added: Record<string, number>,
  skipped: Record<string, number>,
  refMap: ReadonlyMap<number, number>,
): Map<number, number> {
  const columns = columnsOf(db, "main", table).filter((c) => c !== "id");
  const idMap = new Map<number, number>();
  const rows = db.prepare(`select * from src.${table} order by id`).all();
  let count = 0;
  for (const row of rows) {
    const values = columns.map((column) => {
      const value: unknown = (row as Record<string, unknown>)[column];
      if (refColumns.includes(column) && typeof value === "number") {
        return refMap.get(value) ?? value;
      }
      if (value === null || typeof value === "string" || typeof value === "number") return value;
      throw new Error(`unexpected value in ${table}.${column}`);
    });
    const oldId = Number((row as Record<string, unknown>).id);
    const where = columns.map((c) => `"${c}" is ?`).join(" and ");
    const found = selectRows(
      db,
      z.object({ id: z.number() }),
      `select id from main.${table} where ${where}`,
      values,
    )[0];
    if (found !== undefined) {
      idMap.set(oldId, found.id);
      continue;
    }
    const result = db
      .prepare(
        `insert into main.${table} (${columns.map((c) => `"${c}"`).join(", ")}) values (${columns.map(() => "?").join(", ")})`,
      )
      .run(...values);
    idMap.set(oldId, Number(result.lastInsertRowid));
    count += 1;
  }
  added[table] = count;
  if (count < rows.length) skipped[table] = rows.length - count;
  return idMap;
}
