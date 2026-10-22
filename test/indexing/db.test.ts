import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { queryRows } from "../../../src/core/db/query.ts";
import {
  SCHEMA_VERSION,
  migrate,
  openCaseDb,
  selectRows,
} from "../../../src/genealogy/indexing/db.ts";
import {
  DATE_QUALS,
  EVENT_TYPES,
  GENDERS,
  PLACE_TYPES,
  TIE_TYPES,
} from "../../../src/genealogy/indexing/enums.ts";
import { connect } from "../../db.ts";

function addScan(db: DatabaseSync, name = "n_001", width = 1000, height = 800): number {
  const { lastInsertRowid } = db
    .prepare("insert into scan (name, url, width, height) values (?, ?, ?, ?)")
    .run(name, `https://example.org/${name}`, width, height);
  return Number(lastInsertRowid);
}

function addRun(db: DatabaseSync): number {
  const { lastInsertRowid } = db
    .prepare("insert into run (started_at, model) values ('2026-01-01T00:00:00Z', 'test-model')")
    .run();
  return Number(lastInsertRowid);
}

describe("case database", () => {
  it("creates a new database at the current schema version", () => {
    const db = openCaseDb(":memory:");
    const [row] = selectRows(db, z.object({ user_version: z.number() }), "pragma user_version");
    expect(row?.user_version).toBe(SCHEMA_VERSION);
    expect(
      selectRows(db, z.object({ foreign_keys: z.number() }), "pragma foreign_keys")[0]
        ?.foreign_keys,
    ).toBe(1);
  });

  it("upgrades an older database without losing data", () => {
    const dir = mkdtempSync(join(tmpdir(), "indexing-migrations-"));
    writeFileSync(join(dir, "0001_a.sql"), "create table t (id integer primary key) strict;");
    writeFileSync(join(dir, "0002_b.sql"), "alter table t add column name text;");
    const db = new DatabaseSync(":memory:");
    migrate(db, dir);
    expect(
      selectRows(db, z.object({ user_version: z.number() }), "pragma user_version")[0]
        ?.user_version,
    ).toBe(2);
    rmSync(join(dir, "0002_b.sql"));
    const old = new DatabaseSync(":memory:");
    migrate(old, dir);
    old.exec("insert into t (id) values (7)");
    writeFileSync(join(dir, "0002_b.sql"), "alter table t add column name text;");
    migrate(old, dir);
    expect(
      selectRows(old, z.object({ id: z.number(), name: z.null() }), "select id, name from t"),
    ).toEqual([{ id: 7, name: null }]);
    rmSync(dir, { recursive: true });
  });

  it("applying the migrations again changes nothing", () => {
    const db = openCaseDb(":memory:");
    addScan(db);
    migrate(db);
    expect(
      selectRows(db, z.object({ n: z.number() }), "select count(*) as n from scan")[0]?.n,
    ).toBe(1);
  });

  it("refuses a database newer than the code", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`pragma user_version = ${String(SCHEMA_VERSION + 1)}`);
    expect(() => {
      migrate(db);
    }).toThrow(/newer than the code/);
  });
});

describe("scans, boxes and mapping rules", () => {
  it("rejects a scan without size", () => {
    const db = openCaseDb(":memory:");
    expect(() =>
      db.prepare("insert into scan (name, url, width, height) values ('a', 'u', null, 5)").run(),
    ).toThrow();
    expect(() =>
      db.prepare("insert into scan (name, url, width, height) values ('a', 'u', 5, 0)").run(),
    ).toThrow();
  });

  it("rejects a box outside of the scan", () => {
    const db = openCaseDb(":memory:");
    const scan = addScan(db);
    const insert = db.prepare(
      "insert into box (scan_id, x, y, w, h, origin) values (?, ?, ?, ?, ?, ?)",
    );
    expect(() => insert.run(scan, 900, 0, 200, 10, "crop")).toThrow(/outside of the scan/);
    expect(() => insert.run(scan, 0, 790, 10, 20, "crop")).toThrow(/outside of the scan/);
    expect(() => insert.run(scan, 0, 0, 10, 10, "guess")).toThrow();
    insert.run(scan, 900, 700, 100, 100, "manual");
  });

  it("rejects a second mapping for one local id", () => {
    const db = openCaseDb(":memory:");
    db.prepare("insert into ddb_map values ('person', 1, 100)").run();
    expect(() => db.prepare("insert into ddb_map values ('person', 1, 101)").run()).toThrow();
    db.prepare("insert into ddb_map values ('event', 1, 101)").run();
  });

  it("keeps words of one case apart from another", () => {
    const a = openCaseDb(":memory:");
    const b = openCaseDb(":memory:");
    a.prepare("insert into dict_entry (kind, word) values ('surname', 'Іваненко')").run();
    expect(
      selectRows(b, z.object({ n: z.number() }), "select count(*) as n from dict_entry")[0]?.n,
    ).toBe(0);
  });

  it("does not delete a scan that boxes point to", () => {
    const db = openCaseDb(":memory:");
    const scan = addScan(db);
    db.prepare("insert into box (scan_id, x, y, w, h, origin) values (?, 0, 0, 5, 5, 'crop')").run(
      scan,
    );
    expect(() => db.prepare("delete from scan").run()).toThrow();
  });
});

let client: pg.Client;
beforeAll(async () => {
  client = await connect();
});
afterAll(async () => {
  await client.end();
});

async function pgEnum(name: string): Promise<string[]> {
  const rows = await queryRows(
    client,
    z.object({ value: z.string() }),
    `select e.enumlabel as value
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'ddb' and t.typname = $1
      order by e.enumsortorder`,
    [name],
  );
  return rows.map((row) => row.value);
}

describe("enums agree with ddb", () => {
  it("has the same lists as pg_enum", async () => {
    expect([...EVENT_TYPES].toSorted()).toEqual((await pgEnum("event_type")).toSorted());
    expect([...TIE_TYPES].toSorted()).toEqual((await pgEnum("tie_type")).toSorted());
    expect([...DATE_QUALS].toSorted()).toEqual((await pgEnum("date_qual")).toSorted());
    expect([...GENDERS].toSorted()).toEqual((await pgEnum("gender")).toSorted());
    expect([...PLACE_TYPES].toSorted()).toEqual((await pgEnum("place_type")).toSorted());
  });

  it("accepts every ddb value in the sqlite CHECK lists and nothing else", async () => {
    const db = openCaseDb(":memory:");
    const scan = addScan(db);
    const run = addRun(db);
    const person = Number(
      db.prepare("insert into person (run_id, scan_id) values (?, ?)").run(run, scan)
        .lastInsertRowid,
    );
    const other = Number(
      db.prepare("insert into person (run_id, scan_id) values (?, ?)").run(run, scan)
        .lastInsertRowid,
    );

    for (const value of await pgEnum("event_type")) {
      db.prepare("insert into event (run_id, scan_id, type) values (?, ?, ?)").run(
        run,
        scan,
        value,
      );
    }
    expect(() =>
      db.prepare("insert into event (run_id, scan_id, type) values (?, ?, 'bogus')").run(run, scan),
    ).toThrow();

    for (const value of await pgEnum("tie_type")) {
      db.prepare(
        "insert into tie (run_id, scan_id, person_id, other_id, type) values (?, ?, ?, ?, ?)",
      ).run(run, scan, person, other, value);
    }
    expect(() =>
      db
        .prepare(
          "insert into tie (run_id, scan_id, person_id, other_id, type) values (?, ?, ?, ?, 'bogus')",
        )
        .run(run, scan, person, other),
    ).toThrow();

    for (const value of await pgEnum("date_qual")) {
      db.prepare("insert into person (run_id, scan_id, birth_qual) values (?, ?, ?)").run(
        run,
        scan,
        value,
      );
    }
    expect(() =>
      db
        .prepare("insert into person (run_id, scan_id, birth_qual) values (?, ?, 'bogus')")
        .run(run, scan),
    ).toThrow();

    for (const value of await pgEnum("gender")) {
      db.prepare("insert into person (run_id, scan_id, gender) values (?, ?, ?)").run(
        run,
        scan,
        value,
      );
    }
    expect(() =>
      db.prepare("insert into person (run_id, scan_id, gender) values (?, ?, 'x')").run(run, scan),
    ).toThrow();

    for (const value of await pgEnum("place_type")) {
      db.prepare("insert into place (run_id, scan_id, name, type) values (?, ?, 'p', ?)").run(
        run,
        scan,
        value,
      );
    }
    expect(() =>
      db
        .prepare("insert into place (run_id, scan_id, name, type) values (?, ?, 'p', 'bogus')")
        .run(run, scan),
    ).toThrow();
  });
});
