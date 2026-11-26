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

describe("compactToReading household numbers", () => {
  it("takes the number written at the head from `house`, and derives it when there is none", () => {
    const { reading } = compactToReading(
      "scan s\nyear 1912\ncols L 1 9\npage L\nhouse 12\n10;H;m;А;Б;В;40\n200;H;m;Г;Д;Е;30",
      { start: { m: 0, f: 0 } },
    );
    const [written, derived] = reading.households;
    expect(written?.number).toBe("12");
    expect(written?.attributes).toEqual([]);
    expect(derived?.number).toBe("1");
    expect(derived?.attributes.map((a) => a.type)).toEqual(["note"]);
  });
});

describe("compactToReading ties to another member", () => {
  const FAMILY = [
    "scan s",
    "year 1912",
    "cols L 100 900",
    "page L",
    "1000;H;m;Григорій;Даниловъ;Антонюкъ;57",
    "1100;s;f;Марфа;;;18",
    "1200;s;m;Яковъ;;;28",
    "1300;W@1200;f;Евдокія;Несторова;;28",
    "1400;C@1200;m;Трофимъ;;;5",
    "1500;c@1300;f;Елена;;;7",
  ].join("\n");

  it("ties the wife and the children of a son to him, not to the head", () => {
    const { reading } = compactToReading(FAMILY, { start: { m: 0, f: 0 } });
    const [household] = reading.households;
    const key = (given: string): string =>
      household?.members.find((m) => m.given === given)?.key ?? "";
    const ties = (household?.ties ?? []).map((t) => `${t.type}:${t.person}>${t.other}`);
    expect(ties).toEqual([
      `child:${key("Марфа")}>${key("Григорій")}`,
      `child:${key("Яковъ")}>${key("Григорій")}`,
      `spouse:${key("Евдокія")}>${key("Яковъ")}`,
      `child:${key("Трофимъ")}>${key("Яковъ")}`,
      `child:${key("Трофимъ")}>${key("Евдокія")}`,
      `child:${key("Елена")}>${key("Евдокія")}`,
    ]);
  });

  it("refuses a reference to a row that the household does not have", () => {
    expect(() =>
      compactToReading(FAMILY.replace("W@1200", "W@1250"), { start: { m: 0, f: 0 } }),
    ).toThrow(/line 8: no row at y 1250/);
  });

  it("keeps the kin roles tied to the head only", () => {
    expect(() =>
      compactToReading(FAMILY.replace("W@1200", "K:сестра:1:1@1200"), { start: { m: 0, f: 0 } }),
    ).toThrow(/line 8/);
  });
});

describe("compactToReading parents, members without a tie, older kin", () => {
  const ties = (text: string): string[] => {
    const { reading } = compactToReading(text, { start: { m: 0, f: 0 } });
    return reading.households.flatMap((household) =>
      household.ties.map(
        (t) =>
          `${t.type}:${t.person}>${t.other}` +
          (t.type === "kin" ? `:${String(t.up)}:${String(t.down)}` : ""),
      ),
    );
  };
  const HEAD = "scan s\nyear 1912\ncols L 100 900\npage L\n1000;H;m;Иванъ;Петровъ;Сидоренко;44";

  it("writes a parent of the head as the head's child tie", () => {
    expect(ties(`${HEAD}\n1100;P;f;Анна;;;70`)).toEqual(["child:p0>p1"]);
  });

  it("writes a parent of another member with «@y»", () => {
    expect(ties(`${HEAD}\n1100;W;f;Марія;;;40\n1200;P@1100;f;Анна;;;70`)).toEqual([
      "spouse:p1>p0",
      "child:p1>p2",
    ]);
  });

  it("writes no tie for a member whose kinship the row does not name", () => {
    const { reading } = compactToReading(`${HEAD}\n1100;N;m;Яковъ;;;20;;работникъ`, {
      start: { m: 0, f: 0 },
    });
    expect(reading.households[0]?.members).toHaveLength(2);
    expect(reading.households[0]?.ties).toEqual([]);
  });

  it("turns the tie round when the member is of the older line", () => {
    // An uncle is one step up from the head's parent: counted from the head it is 2 up, 1 down.
    expect(ties(`${HEAD}\n1100;K:дядя его:1:2;m;Яковъ;;;60`)).toEqual(["kin:p0>p1:2:1"]);
    expect(ties(`${HEAD}\n1100;K:дѣдъ его:0:2;m;Яковъ;;;80`)).toEqual(["kin:p0>p1:2:0"]);
    expect(ties(`${HEAD}\n1100;K:племянникъ его:2:1;m;Яковъ;;;9`)).toEqual(["kin:p1>p0:2:1"]);
  });
});

describe("compactToReading summary", () => {
  it("says the last head has a spouse only when the wife is the head's own", () => {
    const text =
      "scan s\nyear 1912\ncols L 100 900\npage L\n1000;H;m;Иванъ;Петровъ;Сидоренко;57\n1100;s;m;Яковъ;;;28\n1200;W@1100;f;Анна;;;28";
    expect(compactToReading(text, { start: { m: 0, f: 0 } }).summary.lastHeadHasSpouse).toBe(false);
    expect(
      compactToReading(`${text}\n1300;W;f;Марія;;;50`, { start: { m: 0, f: 0 } }).summary
        .lastHeadHasSpouse,
    ).toBe(true);
  });
});
