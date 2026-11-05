import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate, openCaseDb } from "../../src/indexing/db.ts";
import { DOUBT_ELEMENTS, REVIEW_STATUSES } from "../../src/indexing/enums.ts";
import { namePart } from "../../src/indexing/reading.ts";

function seeded(): DatabaseSync {
  const db = openCaseDb(":memory:");
  db.exec(`
    insert into scan (id, name, url, width, height) values (1, 'n_1', 'u', 1000, 1000);
    insert into run (id, started_at, model) values (1, '2026-01-01T00:00:00Z', 'm');
    insert into person (id, run_id, scan_id, surname) values (1, 1, 1, 'Іваненко');
    insert into name_mention (id, run_id, scan_id, person_id, kind, text) values (1, 1, 1, 1, 'surname', 'Іваненко');
    insert into doubt (id, run_id, scan_id, element) values (1, 1, 1, 'surname');
    insert into sample (id, run_id, name_mention_id, rank) values (1, 1, 1, 1);
  `);
  return db;
}

function accepts(db: DatabaseSync, sql: string): boolean {
  try {
    db.exec(sql);
    return true;
  } catch {
    return false;
  }
}

const NAME_VALUES = [
  "?",
  "…",
  "...",
  "",
  "Зай?цев",
  "Зай…",
  "Зай...",
  "Вѣра",
  "Иванъ",
  "Заицевскій",
];

function checkedList(db: DatabaseSync, table: string, column: string): string[] {
  const row = db.prepare("select sql from sqlite_master where name = ?").get(table);
  const sql = String(row?.sql);
  const pattern = new RegExp(
    `${column}\\s+text[^,]*?check\\s*\\(${column} in \\(([^)]*)\\)\\)`,
    "i",
  );
  const list = pattern.exec(sql)?.[1] ?? "";
  return [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? "");
}

describe("review columns", () => {
  it("has CHECK lists equal to the lists in enums.ts", () => {
    const db = seeded();
    expect(checkedList(db, "doubt", "status")).toEqual([...REVIEW_STATUSES]);
    expect(checkedList(db, "sample", "status")).toEqual([...REVIEW_STATUSES]);
    expect(checkedList(db, "doubt", "element")).toEqual([...DOUBT_ELEMENTS]);
  });

  it("restricts the states of doubts and of the sample to the lists in enums.ts", () => {
    const db = seeded();
    for (const status of REVIEW_STATUSES) {
      expect(accepts(db, `update doubt set status = '${status}' where id = 1`)).toBe(true);
      expect(
        accepts(db, `update sample set status = '${status}', read_text = 'Іваненко' where id = 1`),
      ).toBe(true);
    }
    for (const status of ["tie_added", "tie_deleted", "bogus"]) {
      expect(accepts(db, `update doubt set status = '${status}' where id = 1`)).toBe(false);
      expect(accepts(db, `update sample set status = '${status}' where id = 1`)).toBe(false);
    }
  });

  it("takes doubts about words only", () => {
    const db = seeded();
    for (const element of DOUBT_ELEMENTS) {
      expect(
        accepts(db, `insert into doubt (run_id, scan_id, element) values (1, 1, '${element}')`),
      ).toBe(true);
    }
    for (const element of ["tie", "age", "gender", "other"]) {
      expect(
        accepts(db, `insert into doubt (run_id, scan_id, element) values (1, 1, '${element}')`),
      ).toBe(false);
    }
  });

  it("opens new doubts", () => {
    const db = seeded();
    db.exec("insert into doubt (run_id, scan_id, element) values (1, 1, 'place')");
    const rows = db.prepare("select distinct status from doubt").all();
    expect(rows).toEqual([{ status: "open" }]);
  });

  it("needs the reading of a sample place before it leaves the open state", () => {
    const db = seeded();
    expect(accepts(db, "update sample set status = 'confirmed' where id = 1")).toBe(false);
    expect(
      accepts(db, "update sample set status = 'confirmed', read_text = 'Іваненко' where id = 1"),
    ).toBe(true);
  });

  it("does not let the reading of a sample place change", () => {
    const db = seeded();
    db.exec("update sample set status = 'fixed', read_text = 'Іваненко' where id = 1");
    expect(accepts(db, "update sample set read_text = 'Інший' where id = 1")).toBe(false);
    expect(accepts(db, "update sample set read_text = 'Іваненко', note = 'n' where id = 1")).toBe(
      true,
    );
  });
});

describe("migration to doubts about words", () => {
  const MIGRATIONS = join(import.meta.dirname, "../../src/indexing/migrations");

  it("drops doubts about anything but a word and keeps the rest with their review", () => {
    const dir = mkdtempSync(join(tmpdir(), "indexing-0008-"));
    for (const file of readdirSync(MIGRATIONS).filter((name) => /^000[1-7]_/.test(name))) {
      copyFileSync(join(MIGRATIONS, file), join(dir, file));
    }
    const db = new DatabaseSync(":memory:");
    db.exec("pragma foreign_keys = on");
    migrate(db, dir);
    db.exec(`
      insert into scan (id, name, url, width, height) values (1, 'n_1', 'u', 1000, 1000);
      insert into run (id, started_at, model) values (1, '2026-01-01T00:00:00Z', 'm');
      insert into person (id, run_id, scan_id, given) values (1, 1, 1, 'Ганна'), (2, 1, 1, 'Іван');
      insert into tie (run_id, scan_id, person_id, other_id, type) values (1, 1, 1, 2, 'child');
      insert into doubt (id, run_id, scan_id, element, person_id, read_text, status, resolution)
      values (1, 1, 1, 'given', 1, 'Ганна', 'fixed', 'checked'),
             (2, 1, 1, 'tie', 1, null, 'tie_added', null),
             (3, 1, 1, 'age', 1, '57', 'unknown', null),
             (4, 1, 1, 'other', null, null, 'open', null),
             (5, 1, 1, 'place', null, 'Селець', 'open', null);
    `);
    migrate(db);
    expect(
      db.prepare("select id, element, status, resolution from doubt order by id").all(),
    ).toEqual([
      { id: 1, element: "given", status: "fixed", resolution: "checked" },
      { id: 5, element: "place", status: "open", resolution: null },
    ]);
    expect(db.prepare("select count(*) as n from tie").get()).toEqual({ n: 1 });
    expect(accepts(db, "insert into doubt (run_id, scan_id, element) values (1, 1, 'tie')")).toBe(
      false,
    );
    rmSync(dir, { recursive: true });
  });
});

describe("name rule in the database", () => {
  it.each(NAME_VALUES)("agrees with namePart on %j", (value) => {
    const quoted = `'${value.replaceAll("'", "''")}'`;
    const valid = namePart.safeParse(value).success;
    for (const column of ["given", "patronymic", "surname"]) {
      const db = seeded();
      expect(accepts(db, `update person set ${column} = ${quoted} where id = 1`)).toBe(valid);
      const inserted = seeded();
      expect(
        accepts(
          inserted,
          `insert into person (run_id, scan_id, ${column}) values (1, 1, ${quoted})`,
        ),
      ).toBe(valid);
    }
    const db = seeded();
    expect(accepts(db, `update name_mention set text = ${quoted} where id = 1`)).toBe(valid);
    expect(
      accepts(
        db,
        `insert into name_mention (run_id, scan_id, person_id, kind, text) values (1, 1, 1, 'given', ${quoted})`,
      ),
    ).toBe(valid);
  });

  it("lets a person have no name part", () => {
    const db = seeded();
    expect(accepts(db, "insert into person (run_id, scan_id, gender) values (1, 1, 'male')")).toBe(
      true,
    );
  });
});
