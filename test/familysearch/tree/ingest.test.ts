import { describe, expect, it } from "vitest";
import { z } from "zod";
import { openCaseDb, selectRows } from "../../../src/genealogy/indexing/db.ts";
import { startRun } from "../../../src/genealogy/indexing/run.ts";
import { chooseNames, ingestTree } from "../../../src/genealogy/import/familysearch-tree/ingest.ts";
import type {
  TreeBundle,
  TreePerson,
} from "../../../src/genealogy/import/familysearch-tree/model.ts";

const place = (name: string, id: number | null = 100) => ({
  id,
  name,
  standard: "Selo, Ukraine",
  latitude: 50.1,
  longitude: 24.2,
});
const day = (date: string) => ({ from: date, to: date, qual: "exact" as const });

function person(id: string, extra: Partial<TreePerson> = {}): TreePerson {
  return {
    id,
    gender: "male",
    given: "Іван",
    patronymic: null,
    surname: "Тестовий",
    latin: null,
    birth: null,
    death: null,
    parents: [],
    spouses: [],
    sources: [],
    ...extra,
  };
}

const bundle = (root: string, persons: TreePerson[]): TreeBundle => ({
  root,
  fetchedAt: "2026-10-23T00:00:00Z",
  referenceYear: 2026,
  persons,
  excluded: [],
});

const count = (db: ReturnType<typeof openCaseDb>, table: string): number =>
  selectRows(db, z.object({ n: z.number() }), `select count(*) as n from ${table}`)[0]?.n ?? 0;

describe("chooseNames", () => {
  it("names a place by its most common Cyrillic spelling and lists the others", () => {
    const chosen = chooseNames(
      bundle("AAAA-001", [
        person("AAAA-001", {
          birth: { date: null, dateText: null, place: place("Selo, Ukraine") },
        }),
        person("AAAA-002", {
          birth: { date: null, dateText: null, place: place("Село, Україна") },
        }),
        person("AAAA-003", {
          birth: { date: null, dateText: null, place: place("Село, Україна") },
        }),
      ]),
    );
    expect(chosen.get(100)).toEqual({
      name: "Село, Україна",
      variants: ["Село, Україна", "Selo, Ukraine"],
    });
  });
});

describe("ingestTree", () => {
  const family = (): TreePerson[] => [
    person("AAAA-001", {
      patronymic: "Петрович",
      latin: "Ivan Testovyi",
      birth: { date: day("1900-05-01"), dateText: null, place: place("Село, Україна") },
      death: { date: null, dateText: "до 1950", place: null },
      parents: ["AAAA-002"],
      spouses: [
        {
          id: "AAAA-003",
          marriage: { date: day("1925-01-01"), dateText: null, place: place("Selo, Ukraine") },
        },
      ],
      sources: [
        { id: "S1", title: "Метрична книга", url: "https://example.test/ark/1", date: "1900" },
      ],
    }),
    person("AAAA-002", {
      birth: {
        date: { from: "1868-01-01", to: "1872-12-31", qual: "about" },
        dateText: null,
        place: null,
      },
    }),
    person("AAAA-003", {
      gender: "female",
      surname: null,
      spouses: [{ id: "AAAA-001", marriage: null }],
    }),
  ];

  it("writes persons, dated events, ties, places and attributes with the tables of an indexing run", () => {
    const db = openCaseDb(":memory:");
    const run = startRun(db, { startedAt: "2026-10-23T00:00:00Z", model: "test" });
    const result = ingestTree(db, run, bundle("AAAA-001", family()));
    expect(result).toMatchObject({ persons: 3, known: 0, events: 4, ties: 2, places: 1 });
    const birth = selectRows(
      db,
      z.object({ date_from: z.string(), date_qual: z.string(), year: z.number() }),
      "select date_from, date_qual, year from event where type = 'birth' and date_from = '1900-05-01'",
    );
    expect(birth).toEqual([{ date_from: "1900-05-01", date_qual: "exact", year: 1900 }]);
    const about = selectRows(
      db,
      z.object({ birth_from: z.number(), birth_to: z.number(), birth_qual: z.string() }),
      "select birth_from, birth_to, birth_qual from person where surname = 'Тестовий' and birth_qual = 'about'",
    );
    expect(about).toEqual([{ birth_from: 1868, birth_to: 1872, birth_qual: "about" }]);
    // One marriage event for the pair, one spouse tie; the child tie rides on the birth event.
    expect(count(db, "event where type = 'marriage'")).toBe(1);
    expect(count(db, "tie where type = 'spouse'")).toBe(1);
    expect(count(db, "tie where type = 'child' and event_id is not null")).toBe(1);
    expect(count(db, "scan where width = 1 and height = 1")).toBe(3);
    expect(count(db, "attribute where type = 'url'")).toBe(1);
    expect(count(db, "attribute where value = 'Date as written: до 1950'")).toBe(1);
    expect(count(db, "attribute where value = 'Latin: Ivan Testovyi'")).toBe(1);
  });

  it("keeps one place for the spellings of one FamilySearch place id and the other in the dictionary", () => {
    const db = openCaseDb(":memory:");
    const run = startRun(db, { startedAt: "2026-10-23T00:00:00Z", model: "test" });
    ingestTree(db, run, bundle("AAAA-001", family()));
    expect(count(db, "place")).toBe(1);
    expect(
      count(
        db,
        "dict_entry where kind = 'place' and word = 'Selo, Ukraine' and canon = 'Село, Україна'",
      ),
    ).toBe(1);
  });

  it("writes a person met in another tree once, and does not repeat their ties", () => {
    const db = openCaseDb(":memory:");
    const first = startRun(db, { startedAt: "2026-10-23T00:00:00Z", model: "test" });
    ingestTree(db, first, bundle("AAAA-001", family()));
    const second = startRun(db, { startedAt: "2026-10-23T01:00:00Z", model: "test" });
    const again = ingestTree(
      db,
      second,
      bundle("AAAA-002", [...family(), person("AAAA-004", { parents: ["AAAA-001"] })]),
    );
    expect(again).toMatchObject({ persons: 1, known: 3, events: 0, ties: 1 });
    expect(count(db, "person")).toBe(4);
  });
});
