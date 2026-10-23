import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
import { ATTRIBUTE_TYPES } from "../../../src/genealogy/attribute-types.ts";
import { savePulled } from "../../../src/genealogy/indexing/pull.ts";
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

  it("refuses migrations with a twin number or a gap, since the version is their count", () => {
    const dir = mkdtempSync(join(tmpdir(), "indexing-migrations-"));
    writeFileSync(join(dir, "0001_a.sql"), "create table t (id integer primary key) strict;");
    writeFileSync(join(dir, "0002_b.sql"), "alter table t add column a text;");
    writeFileSync(join(dir, "0002_c.sql"), "alter table t add column b text;");
    expect(() => {
      migrate(new DatabaseSync(":memory:"), dir);
    }).toThrow(/without gaps or duplicates: 0002_c.sql is the 3th/);
    rmSync(join(dir, "0002_c.sql"));
    rmSync(join(dir, "0002_b.sql"));
    writeFileSync(join(dir, "0003_d.sql"), "alter table t add column c text;");
    expect(() => {
      migrate(new DatabaseSync(":memory:"), dir);
    }).toThrow(/0003_d.sql is the 2th/);
    rmSync(dir, { recursive: true });
  });

  it("refuses a database newer than the code", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`pragma user_version = ${String(SCHEMA_VERSION + 1)}`);
    expect(() => {
      migrate(db);
    }).toThrow(/newer than the code/);
  });
});

const MIGRATIONS = join(import.meta.dirname, "../../../src/genealogy/indexing/migrations");

const sampleRow = z.object({
  id: z.number(),
  name_mention_id: z.number(),
  rank: z.number(),
  status: z.string(),
  note: z.string().nullable(),
  read_text: z.string().nullable(),
});
const SAMPLE_COLUMNS = "id, name_mention_id, rank, status, note, read_text";

/** A surname mention of a new person of `run`; returns the mention id. */
function addMention(db: DatabaseSync, scan: number, run: number, text: string): number {
  const { lastInsertRowid: person } = db
    .prepare("insert into person (run_id, scan_id) values (?, ?)")
    .run(run, scan);
  const { lastInsertRowid: mention } = db
    .prepare(
      "insert into name_mention (run_id, scan_id, person_id, kind, text) values (?, ?, ?, 'surname', ?)",
    )
    .run(run, scan, person, text);
  return Number(mention);
}

/**
 * A database as it was before the sample belonged to a run (schema version 8), with two runs and
 * a sample that has been reviewed: places in every state, ids that differ from the ranks.
 */
function databaseBeforeSamplePerRun() {
  const dir = mkdtempSync(join(tmpdir(), "indexing-v8-"));
  for (const file of readdirSync(MIGRATIONS).filter((name) => name < "0009")) {
    copyFileSync(join(MIGRATIONS, file), join(dir, file));
  }
  const db = new DatabaseSync(":memory:");
  db.exec("pragma foreign_keys = on");
  migrate(db, dir);
  rmSync(dir, { recursive: true });
  const scan = addScan(db);
  const run1 = addRun(db);
  const run2 = addRun(db);
  const places = [
    { id: 1, run: run1, rank: 1, status: "open", note: null, read: null },
    { id: 2, run: run1, rank: 2, status: "fixed", note: "виправлено", read: "Старе" },
    { id: 4, run: run2, rank: 3, status: "unknown", note: null, read: "Па…никъ" },
    { id: 7, run: run2, rank: 4, status: "confirmed", note: "ok", read: "Гнатюкъ" },
  ];
  for (const place of places) {
    const mention = addMention(db, scan, place.run, `Прізвище${String(place.id)}`);
    db.prepare(
      "insert into sample (id, name_mention_id, rank, status, note, read_text) values (?, ?, ?, ?, ?, ?)",
    ).run(place.id, mention, place.rank, place.status, place.note, place.read);
  }
  const before = selectRows(db, sampleRow, `select ${SAMPLE_COLUMNS} from sample order by id`);
  return { db, scan, run1, run2, before };
}

describe("migration 0009: the sample belongs to a run", () => {
  it("keeps every place of a reviewed sample as it was", () => {
    const { db, before } = databaseBeforeSamplePerRun();
    expect(
      selectRows(db, z.object({ user_version: z.number() }), "pragma user_version")[0],
    ).toEqual({ user_version: 8 });
    migrate(db);
    expect(before).toHaveLength(4);
    expect(selectRows(db, sampleRow, `select ${SAMPLE_COLUMNS} from sample order by id`)).toEqual(
      before,
    );
  });

  it("takes the run of a place from its mention", () => {
    const { db, run1, run2 } = databaseBeforeSamplePerRun();
    migrate(db);
    const rows = selectRows(
      db,
      z.object({ id: z.number(), run_id: z.number(), mention_run: z.number() }),
      `select s.id, s.run_id, m.run_id as mention_run
         from sample s join name_mention m on m.id = s.name_mention_id order by s.id`,
    );
    expect(rows.map((row) => row.run_id)).toEqual([run1, run1, run2, run2]);
    expect(rows.every((row) => row.run_id === row.mention_run)).toBe(true);
  });

  it("allows the same rank in different runs and refuses it twice in one run", () => {
    const { db, scan, run1, run2 } = databaseBeforeSamplePerRun();
    migrate(db);
    const insert = db.prepare(
      "insert into sample (run_id, name_mention_id, rank) values (?, ?, ?)",
    );
    insert.run(run2, addMention(db, scan, run2, "Нове"), 1);
    expect(() => {
      insert.run(run1, addMention(db, scan, run1, "Ще нове"), 1);
    }).toThrow(/UNIQUE constraint failed/);
  });

  it("refuses a place whose run is not the run of its mention", () => {
    const { db, scan, run1, run2 } = databaseBeforeSamplePerRun();
    migrate(db);
    const mention = addMention(db, scan, run1, "Прізвище");
    expect(() => {
      db.prepare("insert into sample (run_id, name_mention_id, rank) values (?, ?, 9)").run(
        run2,
        mention,
      );
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("still never changes the first reading of a place", () => {
    const { db } = databaseBeforeSamplePerRun();
    migrate(db);
    expect(() => {
      db.prepare("update sample set read_text = 'Нове' where id = 2").run();
    }).toThrow(/does not change/);
    db.prepare("update sample set status = 'confirmed', read_text = 'Перше' where id = 1").run();
    expect(
      selectRows(
        db,
        sampleRow,
        "select id, name_mention_id, rank, status, note, read_text from sample where id = 1",
      )[0]?.read_text,
    ).toBe("Перше");
  });

  it("leaves a consistent database", () => {
    const { db } = databaseBeforeSamplePerRun();
    migrate(db);
    expect(selectRows(db, z.record(z.string(), z.unknown()), "pragma foreign_key_check")).toEqual(
      [],
    );
    expect(
      selectRows(db, z.object({ integrity_check: z.string() }), "pragma integrity_check"),
    ).toEqual([{ integrity_check: "ok" }]);
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

  it("accepts exactly the attribute types of the well", () => {
    const db = openCaseDb(":memory:");
    const scan = addScan(db);
    const run = addRun(db);
    for (const type of ATTRIBUTE_TYPES) {
      db.prepare(
        "insert into attribute (run_id, scan_id, type, on_scan, value) values (?, ?, ?, 1, 'x')",
      ).run(run, scan, type.code);
    }
    expect(() =>
      db
        .prepare(
          "insert into attribute (run_id, scan_id, type, on_scan, value) values (?, ?, 'bogus', 1, 'x')",
        )
        .run(run, scan),
    ).toThrow();
  });
});

describe("pulled repository and sources", () => {
  const pulled = {
    repositories: [{ id: 67, type: "archive", name: "Державний архів", abbr: "ДАЖО", url: null }],
    sources: [
      {
        id: 420602,
        repo: 67,
        type: "confession",
        period_from: "1912-01-01",
        period_to: "1912-12-31",
        period_qual: "exact",
        title: "Сповідні відомості",
        callno: "1/74/406",
        url: "https://example.org/s",
      },
    ],
  };

  it("keeps the ids of the well and updates a row pulled again", () => {
    const db = openCaseDb(":memory:");
    expect(savePulled(db, pulled)).toEqual({ repositories: 1, sources: 1 });
    savePulled(db, { ...pulled, sources: [{ ...(pulled.sources[0] ?? {}), title: "Нова назва" }] });
    expect(
      selectRows(
        db,
        z.object({ id: z.number(), title: z.string() }),
        "select id, title from source",
      ),
    ).toEqual([{ id: 420602, title: "Нова назва" }]);
  });

  it("rejects a source whose date quality is not a ddb one", () => {
    const db = openCaseDb(":memory:");
    expect(() =>
      savePulled(db, {
        ...pulled,
        sources: [{ ...(pulled.sources[0] ?? {}), period_qual: "maybe" }],
      }),
    ).toThrow();
  });
});
