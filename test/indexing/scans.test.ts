import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dumpCaseDb } from "../../../src/genealogy/indexing/dump.ts";
import { openCaseDb } from "../../../src/genealogy/indexing/db.ts";
import { addScans } from "../../../src/genealogy/indexing/scans.ts";

describe("addScans", () => {
  const scan = { name: "n_603", url: "https://example.org/603", width: 6200, height: 5000 };

  it("adds scans once", () => {
    const db = openCaseDb(":memory:");
    expect(addScans(db, [scan])).toBe(1);
    expect(addScans(db, [scan])).toBe(0);
  });

  it("rejects a scan without size and writes nothing", () => {
    const db = openCaseDb(":memory:");
    expect(() => addScans(db, [scan, { name: "n_604", url: "u" }])).toThrow();
    expect(addScans(db, [scan])).toBe(1);
  });
});

describe("dumpCaseDb", () => {
  it("lists the rows of every table as text", () => {
    const dir = mkdtempSync(join(tmpdir(), "indexing-dump-"));
    const path = join(dir, "case.sqlite");
    const db = openCaseDb(path);
    addScans(db, [{ name: "n_1", url: "u", width: 10, height: 20 }]);
    db.close();
    const text = dumpCaseDb(path);
    expect(text).toContain("-- scan\n");
    expect(text).toContain('"name":"n_1"');
  });
});
