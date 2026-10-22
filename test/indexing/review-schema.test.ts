import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openCaseDb } from "../../../src/genealogy/indexing/db.ts";
import { DOUBT_STATUSES, REVIEW_STATUSES } from "../../../src/genealogy/indexing/enums.ts";
import { namePart } from "../../../src/genealogy/indexing/reading.ts";

function seeded(): DatabaseSync {
  const db = openCaseDb(":memory:");
  db.exec(`
    insert into scan (id, name, url, width, height) values (1, 'n_1', 'u', 1000, 1000);
    insert into run (id, started_at, model) values (1, '2026-01-01T00:00:00Z', 'm');
    insert into person (id, run_id, scan_id, surname) values (1, 1, 1, 'Іваненко');
    insert into name_mention (id, run_id, scan_id, person_id, kind, text) values (1, 1, 1, 1, 'surname', 'Іваненко');
    insert into doubt (id, run_id, scan_id, element) values (1, 1, 1, 'surname');
    insert into sample (id, name_mention_id, rank) values (1, 1, 1);
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

function checkedStatuses(db: DatabaseSync, table: string): string[] {
  const row = db.prepare("select sql from sqlite_master where name = ?").get(table);
  const sql = String(row?.sql);
  const list = /status\s+text[^,]*?check\s*\(status in \(([^)]*)\)\)/i.exec(sql)?.[1] ?? "";
  return [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? "");
}

describe("review columns", () => {
  it("has CHECK lists equal to the status lists in enums.ts", () => {
    const db = seeded();
    expect(checkedStatuses(db, "doubt")).toEqual([...DOUBT_STATUSES]);
    expect(checkedStatuses(db, "sample")).toEqual([...REVIEW_STATUSES]);
  });

  it("restricts the states of doubts and of the sample to the lists in enums.ts", () => {
    const db = seeded();
    for (const status of DOUBT_STATUSES) {
      expect(accepts(db, `update doubt set status = '${status}' where id = 1`)).toBe(true);
    }
    expect(accepts(db, "update doubt set status = 'bogus' where id = 1")).toBe(false);
    for (const status of REVIEW_STATUSES) {
      expect(
        accepts(db, `update sample set status = '${status}', read_text = 'Іваненко' where id = 1`),
      ).toBe(true);
    }
    expect(accepts(db, "update sample set status = 'tie_added' where id = 1")).toBe(false);
    expect(accepts(db, "update sample set status = 'bogus' where id = 1")).toBe(false);
  });

  it("opens new doubts", () => {
    const db = seeded();
    db.exec("insert into doubt (run_id, scan_id, element) values (1, 1, 'age')");
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
