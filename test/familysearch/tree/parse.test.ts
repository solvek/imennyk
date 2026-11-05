import { describe, expect, it } from "vitest";
import { detailsSchema } from "../../../src/familysearch/tree/api.ts";
import {
  livingOf,
  readFact,
  readFormalDate,
  readPerson,
  splitGiven,
} from "../../../src/familysearch/tree/parse.ts";
import { fact, summary } from "./fixtures.ts";

describe("readFormalDate", () => {
  it("reads a day, a month and a year as the whole period, exact", () => {
    expect(readFormalDate("+1946-06-28")).toEqual({
      from: "1946-06-28",
      to: "1946-06-28",
      qual: "exact",
    });
    expect(readFormalDate("+1911-02")).toEqual({
      from: "1911-02-01",
      to: "1911-02-28",
      qual: "exact",
    });
    expect(readFormalDate("+1912-02")).toEqual({
      from: "1912-02-01",
      to: "1912-02-29",
      qual: "exact",
    });
    expect(readFormalDate("+1820")).toEqual({
      from: "1820-01-01",
      to: "1820-12-31",
      qual: "exact",
    });
  });

  it("reads about as the year plus or minus two", () => {
    expect(readFormalDate("A+1770")).toEqual({
      from: "1768-01-01",
      to: "1772-12-31",
      qual: "about",
    });
  });

  it("does not read what it cannot bound", () => {
    expect(readFormalDate(null)).toBeNull();
    expect(readFormalDate("+1900/+1910")).toBeNull();
    expect(readFormalDate("A+1770-05")).toBeNull();
    expect(readFormalDate("+1911-13")).toBeNull();
    expect(readFormalDate("+1911-02-30")).toBeNull();
  });
});

describe("readFact", () => {
  it("reads a year written as text when the formal date is missing", () => {
    expect(readFact(fact({ originalDate: "1820" }))?.date).toEqual({
      from: "1820-01-01",
      to: "1820-12-31",
      qual: "exact",
    });
  });

  it("keeps a date it cannot read as text, and the place", () => {
    const event = readFact(
      fact({
        originalDate: "до 1900 р.",
        modifier: "BEFORE",
        place: { id: 7, name: "Село, Україна" },
      }),
    );
    expect(event).toMatchObject({
      date: null,
      dateText: "до 1900 р.",
      place: { id: 7, name: "Село, Україна" },
    });
  });

  it("says nothing for a fact with nothing in it", () => {
    expect(readFact(fact({}))).toBeNull();
    expect(readFact(null)).toBeNull();
  });
});

describe("splitGiven", () => {
  it("takes a second word with a patronymic ending as the patronymic", () => {
    expect(splitGiven("Андрій Петрович")).toEqual({ given: "Андрій", patronymic: "Петрович" });
    expect(splitGiven("Параска Іванівна")).toEqual({ given: "Параска", patronymic: "Іванівна" });
  });

  it("leaves any other name whole", () => {
    expect(splitGiven("Марія Магдалина")).toEqual({ given: "Марія Магдалина", patronymic: null });
    expect(splitGiven("Іван")).toEqual({ given: "Іван", patronymic: null });
  });
});

const details = (extra: Record<string, unknown> = {}) =>
  detailsSchema.parse({
    id: "AAAA-001",
    living: false,
    gender: "FEMALE",
    death: fact({ formalText: "+1990-03-01" }),
    nameConclusion: {
      details: {
        nameForms: [
          { lang: "uk", givenPart: "Параска Іванівна", familyPart: "Тестова" },
          { lang: "uk-Latn", fullText: "Paraska Testova" },
        ],
      },
    },
    parents: [{ parent1: summary("AAAA-002"), parent2: summary("AAAA-003", { living: true }) }],
    spouses: [
      {
        parent1: summary("AAAA-001"),
        parent2: summary("AAAA-004"),
        event: fact({ originalDate: "1920" }),
      },
    ],
    ...extra,
  });

describe("readPerson", () => {
  it("keeps names, gender, parents and spouses as ids only", () => {
    const person = readPerson(details());
    expect(person).toMatchObject({
      id: "AAAA-001",
      gender: "female",
      given: "Параска",
      patronymic: "Іванівна",
      surname: "Тестова",
      latin: "Paraska Testova",
      parents: ["AAAA-002", "AAAA-003"],
      spouses: [{ id: "AAAA-004", marriage: { date: { from: "1920-01-01" } } }],
    });
  });
});

describe("livingOf", () => {
  it("is dead with a death, living by the flag, unknown without any date", () => {
    expect(livingOf(details(), 2026)).toBe("dead");
    expect(livingOf(details({ living: true }), 2026)).toBe("living");
    expect(livingOf(details({ death: null }), 2026)).toBe("unknown");
    expect(
      livingOf(details({ death: null, birth: fact({ formalText: "+1990-01-01" }) }), 2026),
    ).toBe("living");
  });
});
