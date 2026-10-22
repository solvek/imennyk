import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { openCaseDb, selectRows } from "../../../src/genealogy/indexing/db.ts";
import { birthRange, ingestReading } from "../../../src/genealogy/indexing/ingest.ts";
import { savePulled } from "../../../src/genealogy/indexing/pull.ts";

function setup(): { db: DatabaseSync; run: number } {
  const db = openCaseDb(":memory:");
  db.prepare("insert into scan (name, url, width, height) values ('n_1', 'u', 1000, 800)").run();
  const run = Number(
    db.prepare("insert into run (started_at, model) values ('2026-01-01', 'm')").run()
      .lastInsertRowid,
  );
  return { db, run };
}

const count = z.object({ n: z.number() });
function n(db: DatabaseSync, table: string): number | undefined {
  return selectRows(db, count, `select count(*) as n from ${table}`)[0]?.n;
}

const reading = {
  scan: "n_1",
  year: 1912,
  lines: [
    { key: "l1", text: "Иванъ Петровъ Кравчукъ 40 л.", box: { x: 10, y: 10, w: 300, h: 30 } },
  ],
  places: [{ key: "p1", name: "Селець", type: "settlement" }],
  households: [
    {
      key: "h1",
      number: "5",
      place: "p1",
      box: { x: 0, y: 0, w: 500, h: 100 },
      members: [
        {
          key: "a",
          head: true,
          given: "Іван",
          patronymic: "Петрович",
          surname: "Кравчук",
          gender: "male",
          age: 40,
          surname_box: { x: 200, y: 10, w: 80, h: 30 },
          line: "l1",
        },
        { key: "b", given: "Марія", surname: "Кравчук", gender: "female", age: 38 },
        { key: "c", given: "Петро", gender: "male", age: "1/2" },
      ],
      ties: [
        { person: "b", other: "a", type: "spouse" },
        { person: "c", other: "a", type: "child" },
      ],
    },
  ],
  doubts: [{ element: "surname", person: "a", read: "Кравчук", variants: "Кравчун" }],
};

describe("ingestReading", () => {
  it("writes the household as a confession event with the head as main person", () => {
    const { db, run } = setup();
    const result = ingestReading(db, run, reading);
    expect(result).toEqual({
      lines: 1,
      places: 1,
      persons: 3,
      events: 1,
      ties: 2,
      nameMentions: 6,
      doubts: 1,
      dictionary: 0,
      attributes: 0,
    });
    const [event] = selectRows(
      db,
      z.object({ type: z.string(), given: z.string(), year: z.number(), number: z.string() }),
      "select e.type, p.given, e.year, e.number from event e join person p on p.id = e.main_person_id",
    );
    expect(event).toEqual({ type: "confession", given: "Іван", year: 1912, number: "5" });
  });

  it("turns whole-year age into a calculated birth range, keeps other forms", () => {
    expect(birthRange(1912, 30)).toEqual({ from: 1881, to: 1882 });
    const { db, run } = setup();
    ingestReading(db, run, reading);
    const rows = selectRows(
      db,
      z.object({
        given: z.string(),
        age: z.string(),
        from: z.number().nullable(),
        to: z.number().nullable(),
        q: z.string().nullable(),
      }),
      "select given, age, birth_from as 'from', birth_to as 'to', birth_qual as q from person order by id",
    );
    expect(rows[0]).toEqual({ given: "Іван", age: "40", from: 1871, to: 1872, q: "calculated" });
    expect(rows[2]).toEqual({ given: "Петро", age: "1/2", from: null, to: null, q: null });
  });

  it("uses the box of the name part for its mention, else the person box", () => {
    const { db, run } = setup();
    ingestReading(db, run, reading);
    const rows = selectRows(
      db,
      z.object({ w: z.number() }),
      `select b.w from name_mention m join box b on b.id = m.box_id
        where m.kind = 'surname' and m.text = 'Кравчук' order by m.id`,
    );
    expect(rows[0]?.w).toBe(80);
    expect(rows[1]?.w).toBe(500);
  });

  it("leaves the database untouched when a reference is unknown", () => {
    const { db, run } = setup();
    const bad = structuredClone(reading);
    bad.households[0]?.ties.push({ person: "zzz", other: "a", type: "child" });
    expect(() => ingestReading(db, run, bad)).toThrow(/unknown person key «zzz»/);
    for (const table of ["person", "event", "tie", "box", "text_line", "place", "doubt"]) {
      expect(n(db, table)).toBe(0);
    }
  });

  it("names the field of an invalid tie type and writes nothing", () => {
    const { db, run } = setup();
    const bad = structuredClone(reading);
    const tie = bad.households[0]?.ties[0];
    if (tie === undefined) throw new Error("fixture");
    tie.type = "brother";
    expect(() => ingestReading(db, run, bad)).toThrow(/households.*ties.*type/s);
    expect(n(db, "person")).toBe(0);
  });

  it("rejects a household without exactly one head, an unknown scan and a box outside the scan", () => {
    const { db, run } = setup();
    const noHead = structuredClone(reading);
    const first = noHead.households[0]?.members[0];
    if (first === undefined) throw new Error("fixture");
    first.head = false;
    expect(() => ingestReading(db, run, noHead)).toThrow(/exactly one head/);
    expect(() => ingestReading(db, run, { ...reading, scan: "n_9" })).toThrow(/unknown scan/);
    const outside = structuredClone(reading);
    outside.lines[0] = { key: "l1", text: "x", box: { x: 990, y: 0, w: 50, h: 5 } };
    expect(() => ingestReading(db, run, outside)).toThrow(/outside of the scan/);
    expect(n(db, "person")).toBe(0);
  });

  it("keeps the readings of earlier runs when a scan is read again", () => {
    const { db, run } = setup();
    const second = Number(
      db.prepare("insert into run (started_at, model) values ('2026-02-01', 'm2')").run()
        .lastInsertRowid,
    );
    ingestReading(db, run, reading);
    ingestReading(db, second, {
      ...reading,
      households: [{ ...reading.households[0], key: "h2" }],
    });
    expect(
      selectRows(
        db,
        z.object({ run_id: z.number(), n: z.number() }),
        "select run_id, count(*) as n from person group by run_id order by run_id",
      ),
    ).toEqual([
      { run_id: run, n: 3 },
      { run_id: second, n: 3 },
    ]);
  });

  it("adds words to the dictionary of the case once", () => {
    const { db, run } = setup();
    const withWords = {
      ...reading,
      dictionary: [{ kind: "surname", word: "Кравчук", canon: "Кравчук" }],
    };
    expect(ingestReading(db, run, withWords).dictionary).toBe(1);
    expect(ingestReading(db, run, withWords).dictionary).toBe(0);
    expect(n(db, "dict_entry")).toBe(1);
  });

  it("records an unreadable word and requires its visible letters in note or read", () => {
    const { db, run } = setup();
    ingestReading(db, run, {
      ...reading,
      doubts: [{ element: "surname", person: "a", unreadable: true, read: "Па…никъ" }],
    });
    expect(
      selectRows(
        db,
        z.object({ unreadable: z.number(), read_text: z.string() }),
        "select unreadable, read_text from doubt",
      ),
    ).toEqual([{ unreadable: 1, read_text: "Па…никъ" }]);
    expect(() =>
      ingestReading(db, run, { ...reading, doubts: [{ element: "surname", unreadable: true }] }),
    ).toThrow();
  });
});

describe("doubts and scan attributes", () => {
  it("rejects a sign of doubt in a name and says where to put it", () => {
    const { db, run } = setup();
    const bad = structuredClone(reading);
    const head = bad.households[0]?.members[0];
    if (head === undefined) throw new Error("fixture");
    head.surname = "Супр…ская";
    expect(() => ingestReading(db, run, bad)).toThrow(/without «\?» or «…»/);
    head.surname = "Занцевский?";
    expect(() => ingestReading(db, run, bad)).toThrow(/without «\?» or «…»/);
    expect(n(db, "person")).toBe(0);
  });

  it("rejects a doubt about a name the person does not have", () => {
    const { db, run } = setup();
    const bad = { ...reading, doubts: [{ element: "patronymic", person: "b", read: "x" }] };
    expect(() => ingestReading(db, run, bad)).toThrow(/most plausible full variant/);
    expect(n(db, "doubt")).toBe(0);
  });

  it("keeps the notes of the scan as its attributes, apart from doubts, and adds the next ones", () => {
    const { db, run } = setup();
    ingestReading(db, run, {
      ...reading,
      doubts: [],
      scan_attributes: [{ type: "note", value: "left page is empty" }],
    });
    ingestReading(db, run, {
      ...reading,
      doubts: [],
      scan_attributes: [{ type: "note", value: "title page" }],
    });
    expect(
      selectRows(
        db,
        z.object({ type: z.string(), value: z.string() }),
        "select type, value from attribute where on_scan = 1 order by id",
      ),
    ).toEqual([
      { type: "note", value: "left page is empty" },
      { type: "note", value: "title page" },
    ]);
    expect(n(db, "doubt")).toBe(0);
  });
});

describe("attributes", () => {
  const withAttributes = structuredClone(reading);
  const head = withAttributes.households[0]?.members[0];
  if (head === undefined) throw new Error("fixture");
  Object.assign(head, {
    attributes: [
      { type: "occupation", value: "священник" },
      { type: "serial", value: "124" },
    ],
  });
  Object.assign(withAttributes.households[0] ?? {}, {
    attributes: [{ type: "note", value: "Номер двору виведено" }],
  });

  it("stores attributes of a person and of a household event with a type of the well", () => {
    const { db, run } = setup();
    expect(ingestReading(db, run, withAttributes).attributes).toBe(3);
    expect(
      selectRows(
        db,
        z.object({ type: z.string(), value: z.string(), owner: z.string() }),
        `select type, value, case when person_id is not null then 'person' when event_id is not null then 'event' end as owner
           from attribute order by id`,
      ),
    ).toEqual([
      { type: "occupation", value: "священник", owner: "person" },
      { type: "serial", value: "124", owner: "person" },
      { type: "note", value: "Номер двору виведено", owner: "event" },
    ]);
  });

  it("rejects a type that is not an attribute type of the well and writes nothing", () => {
    const { db, run } = setup();
    const bad = structuredClone(withAttributes);
    const member = bad.households[0]?.members[0];
    if (member === undefined) throw new Error("fixture");
    Object.assign(member, { attributes: [{ type: "mood", value: "good" }] });
    expect(() => ingestReading(db, run, bad)).toThrow(/unknown attribute type/);
    expect(n(db, "person")).toBe(0);
  });

  it("has exactly one owner", () => {
    const { db, run } = setup();
    ingestReading(db, run, withAttributes);
    expect(() =>
      db
        .prepare(
          "insert into attribute (run_id, scan_id, type, person_id, on_scan, value) values (?, 1, 'note', 1, 1, 'x')",
        )
        .run(run),
    ).toThrow();
    expect(() =>
      db
        .prepare("insert into attribute (run_id, scan_id, type, value) values (?, 1, 'note', 'x')")
        .run(run),
    ).toThrow();
  });
});

describe("source of the household", () => {
  it("links the event to a source pulled from the well and rejects an unknown one", () => {
    const { db, run } = setup();
    expect(() => ingestReading(db, run, { ...reading, source: 420602 })).toThrow(
      /pull it from the well/,
    );
    savePulled(db, {
      repositories: [{ id: 67, type: "archive", name: "Державний архів", abbr: "ДАЖО", url: null }],
      sources: [
        {
          id: 420602,
          repo: 67,
          type: "confession",
          period_from: null,
          period_to: null,
          period_qual: null,
          title: "Сповідні відомості",
          callno: "1/74/406",
          url: null,
        },
      ],
    });
    ingestReading(db, run, { ...reading, source: 420602 });
    expect(
      selectRows(
        db,
        z.object({ n: z.number() }),
        "select count(*) as n from event where source_id = 420602",
      )[0]?.n,
    ).toBe(1);
  });
});

describe("household over a page break", () => {
  function twoScans(): { db: DatabaseSync; run: number } {
    const { db, run } = setup();
    db.prepare("insert into scan (name, url, width, height) values ('n_2', 'u2', 1000, 800)").run();
    ingestReading(db, run, reading);
    return { db, run };
  }
  const next = {
    scan: "n_2",
    year: 1912,
    households: [
      {
        key: "cont",
        continues: { scan: "n_1", household: "h1" },
        members: [
          { key: "k", given: "Анна", gender: "female", age: 2, box: { x: 1, y: 1, w: 50, h: 20 } },
        ],
        ties: [
          { person: "k", other: "@head", type: "child" },
          { person: "k", other: "@spouse", type: "child" },
        ],
      },
    ],
  };

  it("adds the members to the earlier household without a new event", () => {
    const { db, run } = twoScans();
    const events = n(db, "event");
    expect(ingestReading(db, run, next).events).toBe(0);
    expect(n(db, "event")).toBe(events);
    const rows = selectRows(
      db,
      z.object({ other: z.string(), scan: z.string(), event_scan: z.string() }),
      `select o.given as other, s.name as scan, es.name as event_scan
         from tie t join person o on o.id = t.other_id join scan s on s.id = t.scan_id
         join event e on e.id = t.event_id join scan es on es.id = e.scan_id
        where t.person_id = (select id from person where given = 'Анна')`,
    );
    expect(rows.map((row) => row.other).toSorted()).toEqual(["Іван", "Марія"]);
    expect(rows.every((row) => row.scan === "n_2" && row.event_scan === "n_1")).toBe(true);
  });

  it("rejects an unknown household, a head and @head in an ordinary household", () => {
    const { db, run } = twoScans();
    expect(() =>
      ingestReading(db, run, {
        ...next,
        households: [{ ...next.households[0], continues: { scan: "n_1", household: "zz" } }],
      }),
    ).toThrow(/no household «zz»/);
    const withHead = structuredClone(next);
    const member = withHead.households[0]?.members[0];
    if (member === undefined) throw new Error("fixture");
    Object.assign(member, { head: true });
    expect(() => ingestReading(db, run, withHead)).toThrow(/must have no head/);
    const ordinary = {
      ...reading,
      households: [
        {
          ...reading.households[0],
          key: "h9",
          ties: [{ person: "a", other: "@head", type: "child" }],
        },
      ],
    };
    expect(() => ingestReading(db, run, ordinary)).toThrow(/only for a continued household/);
  });
});
