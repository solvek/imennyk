import { describe, expect, it } from "vitest";
import { z } from "zod";
import { compactToReading } from "../../src/indexing/compact.ts";
import { openCaseDb, selectRows } from "../../src/indexing/db.ts";
import { ingestReading } from "../../src/indexing/ingest.ts";
import { startRun } from "../../src/indexing/run.ts";

const TEXT = `
scan s1
year 1912
place Тестове settlement
cols L 100 900
page L
section Духовные
1000;H;m;Иванъ;Петровъ;Сидоренко;44;;
1100;W;f;Марія;Стефанова;;40
1200;S;m;Петръ;;;12;;по малолѣтству не былъ
! given;Петръ;Пётръ
1300-1400;K:мать его:1:0;f;Анна;;;70
printed 2 2
1500;H;f;Ганна;Яковлева;Мельникъ;50
1600;d;f;Олена;;;9
printed 2 4
`;

describe("compactToReading", () => {
  it("builds households, ties, serials and boxes from the notation", () => {
    const { reading, summary } = compactToReading(TEXT, { start: { m: 0, f: 0 } });
    expect(summary).toMatchObject({ persons: 6, males: 2, females: 4, households: 2 });
    const db = openCaseDb(":memory:");
    db.prepare("insert into scan (name, url, width, height) values ('s1', 'u', 2000, 2000)").run();
    const run = startRun(db, { startedAt: "2026-11-05T10:00:00Z", model: "m" });
    ingestReading(db, run, reading);
    const ties = selectRows(
      db,
      z.object({ type: z.string(), n: z.number() }),
      "select type, count(*) as n from tie group by type order by type",
    );
    // son: head + wife, daughter of the woman head: head only
    expect(ties).toEqual([
      { type: "child", n: 3 },
      { type: "kin", n: 1 },
      { type: "spouse", n: 1 },
    ]);
    const first = selectRows(
      db,
      z.object({ number: z.string() }),
      "select number from event order by id",
    );
    expect(first.map((r) => r.number)).toEqual(["1", "1"]);
  });

  it("refuses printed counters that disagree with the rows", () => {
    expect(() =>
      compactToReading("scan s\nyear 1912\ncols L 1 9\npage L\n10;H;m;А;Б;В;1\nprinted 2 0", {
        start: { m: 0, f: 0 },
      }),
    ).toThrow(/printed counters 2\/0/);
  });

  it("needs `cont` for rows without a head", () => {
    expect(() =>
      compactToReading("scan s\nyear 1912\ncols L 1 9\npage L\n10;S;m;А;;;1", {
        start: { m: 0, f: 0 },
      }),
    ).toThrow(/cont/);
  });
});

describe("compactToReading places", () => {
  it("gives each household the place that was current when it began", () => {
    const { reading } = compactToReading(
      "scan s\nyear 1912\nplace Перше settlement\ncols L 1 9\npage L\n10;H;m;А;Б;В;1\nplace Друге settlement\n20;H;m;Г;Д;Е;2",
      { start: { m: 0, f: 0 } },
    );
    expect(reading.places.map((p) => p.name)).toEqual(["Перше", "Друге"]);
    expect(reading.households.map((h) => h.place)).toEqual(["v1", "v2"]);
  });
});
