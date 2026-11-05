import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openCaseDb } from "../../../src/genealogy/indexing/db.ts";
import { caseHints, formatHints, parseNameKind } from "../../../src/genealogy/indexing/hints.ts";
import { ingestReading } from "../../../src/genealogy/indexing/ingest.ts";
import { startRun } from "../../../src/genealogy/indexing/run.ts";

const box = { x: 10, y: 10, w: 100, h: 15 };

/** A case where run 1 has read three persons; run 2 has just been started and has read nothing. */
function caseAfterFirstRun(surnames: readonly string[]): { db: DatabaseSync; second: number } {
  const db = openCaseDb(":memory:");
  db.exec("insert into scan (name, url, width, height) values ('1', 'u', 2000, 2000)");
  const first = startRun(db, { startedAt: "2026-10-22T10:00:00Z", model: "m1" });
  ingestReading(db, first, {
    scan: "1",
    year: 1912,
    households: [
      {
        key: "h",
        members: surnames.map((surname, i) => ({
          key: `p${String(i)}`,
          head: i === 0,
          given: i === 2 ? "Марія" : "Іван",
          patronymic: i === 0 ? "Петровъ" : undefined,
          surname,
          box,
        })),
      },
    ],
    dictionary: [
      { kind: "surname", word: "Кравчукъ", canon: "Кравчук" },
      { kind: "given", word: "Вѣра", canon: "Віра", note: "стара форма" },
    ],
  });
  const second = startRun(db, { startedAt: "2026-10-23T10:00:00Z", model: "m2" });
  return { db, second };
}

describe("caseHints", () => {
  it("gives a new run the dictionary and the names that earlier runs of the case read", () => {
    const { db } = caseAfterFirstRun(["Кравчукъ", "Мельникъ", "Кравчукъ"]);
    const hints = caseHints(db);
    expect(hints.dictionary).toEqual([
      { kind: "given", word: "Вѣра", canon: "Віра", note: "стара форма" },
      { kind: "surname", word: "Кравчукъ", canon: "Кравчук", note: null },
    ]);
    expect(hints.names.filter((n) => n.kind === "surname")).toEqual([
      { kind: "surname", text: "Кравчукъ", count: 2 },
      { kind: "surname", text: "Мельникъ", count: 1 },
    ]);
    expect(hints.names.filter((n) => n.kind === "given")).toEqual([
      { kind: "given", text: "Іван", count: 2 },
      { kind: "given", text: "Марія", count: 1 },
    ]);
    expect(hints.names.filter((n) => n.kind === "patronymic")).toEqual([
      { kind: "patronymic", text: "Петровъ", count: 1 },
    ]);
  });

  it("counts a name by every run that read it, and shows the name as the review fixed it", () => {
    const { db, second } = caseAfterFirstRun(["Кравчукъ", "Мельникъ", "Кравчукъ"]);
    ingestReading(db, second, {
      scan: "1",
      year: 1912,
      households: [
        { key: "h", members: [{ key: "a", head: true, given: "Іван", surname: "Мельникъ", box }] },
      ],
    });
    db.prepare("update person set surname = 'Кравчук' where surname = 'Кравчукъ'").run();
    const surnames = caseHints(db).names.filter((n) => n.kind === "surname");
    expect(surnames).toEqual([
      { kind: "surname", text: "Кравчук", count: 2 },
      { kind: "surname", text: "Мельникъ", count: 2 },
    ]);
  });

  it("narrows both the dictionary and the names to one kind", () => {
    const { db } = caseAfterFirstRun(["Кравчукъ", "Мельникъ", "Кравчукъ"]);
    const hints = caseHints(db, { kind: "surname" });
    expect(hints.dictionary.map((entry) => entry.word)).toEqual(["Кравчукъ"]);
    expect(new Set(hints.names.map((n) => n.kind))).toEqual(new Set(["surname"]));
  });

  it("knows nothing of another case", () => {
    const one = caseAfterFirstRun(["Кравчукъ", "Мельникъ", "Кравчукъ"]);
    const other = caseAfterFirstRun(["Козакъ", "Козакъ", "Козакъ"]);
    const texts = (db: DatabaseSync) => caseHints(db).names.map((n) => n.text);
    expect(texts(one.db)).not.toContain("Козакъ");
    expect(texts(other.db)).not.toContain("Мельникъ");
  });

  it("is empty for a case that read nothing", () => {
    expect(caseHints(openCaseDb(":memory:"))).toEqual({ dictionary: [], names: [] });
  });
});

describe("formatHints", () => {
  it("prints the dictionary and then every kind that has names, most frequent first", () => {
    const { db } = caseAfterFirstRun(["Кравчукъ", "Мельникъ", "Кравчукъ"]);
    expect(formatHints(caseHints(db))).toBe(
      [
        "# Словник справи (2)",
        "given\tВѣра\tВіра\tстара форма",
        "surname\tКравчукъ\tКравчук\t",
        "",
        "# Імена, різних: 2",
        "2\tІван",
        "1\tМарія",
        "",
        "# По батькові, різних: 1",
        "1\tПетровъ",
        "",
        "# Прізвища, різних: 2",
        "2\tКравчукъ",
        "1\tМельникъ",
        "",
      ].join("\n"),
    );
  });

  it("prints only the dictionary header for a case that read nothing", () => {
    expect(formatHints(caseHints(openCaseDb(":memory:")))).toBe("# Словник справи (0)\n");
  });
});

describe("parseNameKind", () => {
  it("accepts the three kinds and nothing named, and refuses any other", () => {
    expect(parseNameKind(undefined)).toBeUndefined();
    expect(parseNameKind("surname")).toBe("surname");
    expect(parseNameKind("patronymic")).toBe("patronymic");
    expect(() => parseNameKind("place")).toThrow(
      /kind must be given, patronymic or surname: place/,
    );
  });
});
