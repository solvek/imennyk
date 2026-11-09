import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseOperator } from "../../src/credits/operator.ts";

const read = (name: string): string =>
  readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");

describe("parseOperator", () => {
  it("reads the sample file", () => {
    expect(parseOperator(read("operator.sample.yaml")).credit).toBe(
      "[Jane Doe](mailto:jane@example.org)",
    );
  });

  it("reads the operator file of the repository", () => {
    expect(parseOperator(read("operator.yaml")).credit).toMatch(/^\[[^\]]+\]\(mailto:[^)]+\)$/);
  });

  it("refuses a blank credit and a missing one", () => {
    expect(() => parseOperator('credit: "  "')).toThrow();
    expect(() => parseOperator("name: x")).toThrow();
  });
});
