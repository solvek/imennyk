import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { openCaseDb, selectRows } from "../../src/indexing/db.ts";
import { ingestReading } from "../../src/indexing/ingest.ts";
import { mergeBanks } from "../../src/indexing/merge.ts";
import { startRun } from "../../src/indexing/run.ts";

function bank(path: string, scan: string, surnames: string[]): void {
  const db = openCaseDb(path);
  db.prepare("insert into scan (name, url, width, height) values (?, 'u', 2000, 2000)").run(scan);
  const run = startRun(db, { startedAt: "2026-10-22T10:00:00Z", model: "m", note: scan });
  ingestReading(db, run, {
    scan,
    year: 1912,
    households: [
      {
        key: "h",
        members: surnames.map((surname, i) => ({
          key: `p${String(i)}`,
          head: i === 0,
          surname,
          box: { x: 10, y: 10 + i * 20, w: 100, h: 15 },
        })),
      },
    ],
  });
  db.prepare("insert into ddb_map (kind, local_id, ddb_id) values ('person', 1, 500)").run();
  db.prepare("insert into ddb_map (kind, local_id, ddb_id) values ('citation', 1, 900)").run();
  db.prepare("insert into dict_entry (kind, word) values ('surname', 'Шевчук')").run();
  db.close();
}

const count = z.object({ n: z.number() });

describe("mergeBanks", () => {
  it("adds the source with shifted ids and keeps the references", () => {
    const dir = mkdtempSync(join(tmpdir(), "merge-"));
    bank(join(dir, "a.sqlite"), "a_1", ["Іваненко", "Петренко"]);
    bank(join(dir, "b.sqlite"), "b_1", ["Коваль", "Мельник", "Бойко"]);
    const target = openCaseDb(join(dir, "a.sqlite"));
    const result = mergeBanks(target, join(dir, "b.sqlite"));

    expect(result.added.person).toBe(3);
    expect(result.added.run).toBe(1);
    expect(result.skipped.dict_entry).toBe(1);
    const persons = selectRows(target, count, "select count(*) as n from person")[0];
    expect(persons?.n).toBe(5);
    expect(target.prepare("pragma foreign_key_check").all()).toEqual([]);
    // The third person of b was person 3 there; its map entry moved with it.
    const map = selectRows(
      target,
      z.object({ local_id: z.number(), ddb_id: z.number() }),
      "select local_id, ddb_id from ddb_map where kind = 'person' order by local_id",
    );
    expect(map).toEqual([
      { local_id: 1, ddb_id: 500 },
      { local_id: 3, ddb_id: 500 },
    ]);
    const surname = selectRows(
      target,
      z.object({ surname: z.string() }),
      "select p.surname from person p join scan s on s.id = p.scan_id where s.name = 'b_1' order by p.id",
    );
    expect(surname.map((r) => r.surname)).toEqual(["Коваль", "Мельник", "Бойко"]);
  });

  it("refuses scans that are in the target already", () => {
    const dir = mkdtempSync(join(tmpdir(), "merge-"));
    bank(join(dir, "a.sqlite"), "same", ["Іваненко"]);
    bank(join(dir, "b.sqlite"), "same", ["Коваль"]);
    const target = openCaseDb(join(dir, "a.sqlite"));
    expect(() => mergeBanks(target, join(dir, "b.sqlite"))).toThrow(/already in the target/);
    expect(selectRows(target, count, "select count(*) as n from person")[0]?.n).toBe(1);
  });
});
