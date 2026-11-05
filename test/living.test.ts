// The rule for every tree import: a living person is never entered.
import { describe, expect, it } from "vitest";
import { livingState, mayEnter } from "../src/living.ts";

const YEAR = 2026;

describe("livingState", () => {
  it("trusts the flag of the source above everything", () => {
    expect(livingState({ flaggedLiving: true, deathRecorded: true, birthYear: 1700 }, YEAR)).toBe(
      "living",
    );
  });

  it("calls a person with a recorded death dead, with or without a date", () => {
    expect(livingState({ flaggedLiving: false, deathRecorded: true }, YEAR)).toBe("dead");
    expect(livingState({ deathRecorded: true, birthYear: 1990 }, YEAR)).toBe("dead");
  });

  it("counts from the birth year when the source says nothing else", () => {
    expect(livingState({ deathRecorded: false, birthYear: 1950 }, YEAR)).toBe("living");
    expect(livingState({ deathRecorded: false, birthYear: 1917 }, YEAR)).toBe("living");
    expect(livingState({ deathRecorded: false, birthYear: 1916 }, YEAR)).toBe("dead");
    expect(livingState({ deathRecorded: false, birthYear: 1850 }, YEAR)).toBe("dead");
  });

  it("does not guess without a flag, a death or a birth year", () => {
    expect(livingState({ flaggedLiving: false, deathRecorded: false }, YEAR)).toBe("unknown");
  });

  it("lets only the dead in", () => {
    expect(mayEnter("dead")).toBe(true);
    expect(mayEnter("living")).toBe(false);
    expect(mayEnter("unknown")).toBe(false);
  });
});
