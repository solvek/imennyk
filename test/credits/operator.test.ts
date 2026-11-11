import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatOperator,
  missingOperatorMessage,
  operatorPath,
  parseOperator,
} from "../../src/credits/operator.ts";

const read = (name: string): string =>
  readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");

describe("parseOperator", () => {
  it("reads the sample file of the skill", () => {
    expect(parseOperator(read("skills/imennyk/assets/operator.sample.yaml")).credit).toBe(
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

describe("formatOperator", () => {
  it("writes a file that reads back to the same credit", () => {
    const credit = "[Jane Doe](mailto:jane@example.org)";
    expect(parseOperator(formatOperator(credit)).credit).toBe(credit);
  });

  it("refuses a blank credit", () => {
    expect(() => formatOperator(" ")).toThrow();
  });
});

describe("operatorPath", () => {
  it("is in the user's configuration by default", () => {
    expect(operatorPath({}, "/home/jane")).toBe("/home/jane/.config/imennyk/operator.yaml");
  });

  it("follows XDG_CONFIG_HOME", () => {
    expect(operatorPath({ XDG_CONFIG_HOME: "/cfg" }, "/home/jane")).toBe(
      "/cfg/imennyk/operator.yaml",
    );
  });

  it("takes IMENNYK_OPERATOR first", () => {
    expect(
      operatorPath({ IMENNYK_OPERATOR: "/x/op.yaml", XDG_CONFIG_HOME: "/cfg" }, "/home/jane"),
    ).toBe("/x/op.yaml");
  });
});

describe("missingOperatorMessage", () => {
  it("tells the agent to ask the person and how to write the answer", () => {
    const message = missingOperatorMessage("/home/jane/.config/imennyk/operator.yaml");
    expect(message).toContain("Ask the person");
    expect(message).toContain("indexing operator --set");
  });
});
