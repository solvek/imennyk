import { describe, expect, it } from "vitest";
import { crawlTrees } from "../../../src/genealogy/import/familysearch-tree/crawl.ts";
import { fakeFetcher, type FakePerson, type Pedigree } from "./fixtures.ts";

const options = { referenceYear: 2026, fetchedAt: "2026-10-23T00:00:00Z" };

// A root with a father and a mother who is alive, the father's father of unknown state, and a
// living child of the root that only a family list names.
const people: FakePerson[] = [
  {
    id: "AAAA-R01",
    name: "Корінь",
    death: true,
    birth: "+1950",
    parents: ["AAAA-F01", "AAAA-M01"],
    livingChild: { id: "AAAA-C01", name: "Живий Нащадок" },
  },
  {
    id: "AAAA-F01",
    name: "Батько",
    death: true,
    birth: "+1920-05-01",
    parents: ["AAAA-G01"],
    spouse: "AAAA-M01",
    sources: [{ id: "SRC1-001", title: "Метрична книга", uri: "https://example.test/ark/1" }],
  },
  { id: "AAAA-M01", name: "Мати", living: true, birth: "+1925" },
  { id: "AAAA-G01", name: "Дід" },
];
const pedigrees: Record<string, Pedigree> = {
  "AAAA-R01": [[["AAAA-R01", null]], [["AAAA-F01", "AAAA-M01"]], [["AAAA-G01", null]]],
};

describe("crawlTrees", () => {
  it("keeps the dead, leaves the living and the unknown as an id and a reason", async () => {
    const [bundle] = await crawlTrees(fakeFetcher(people, pedigrees), ["AAAA-R01"], options);
    expect(bundle?.persons.map((p) => p.id)).toEqual(["AAAA-F01", "AAAA-R01"]);
    expect(bundle?.excluded).toEqual([
      { id: "AAAA-G01", reason: "unknown" },
      { id: "AAAA-M01", reason: "living" },
    ]);
  });

  it("does not ask for the details of a person the pedigree already shows alive", async () => {
    const fetcher = fakeFetcher(people, pedigrees);
    await crawlTrees(fetcher, ["AAAA-R01"], options);
    expect(fetcher.calls).not.toContain("details AAAA-M01");
  });

  it("leaves nothing about a living person in the result, not even as a relative", async () => {
    const [bundle] = await crawlTrees(fakeFetcher(people, pedigrees), ["AAAA-R01"], options);
    // Only the id and the reason of a living person stay, in `excluded`.
    const text = JSON.stringify({ ...bundle, excluded: [] });
    expect(text).not.toContain("Живий");
    expect(text).not.toContain("AAAA-C01");
    expect(text).not.toContain("AAAA-M01");
    const father = bundle?.persons.find((p) => p.id === "AAAA-F01");
    expect(father?.parents).toEqual([]);
    expect(father?.spouses).toEqual([]);
  });

  it("links the persons that are kept and attaches their sources", async () => {
    const [bundle] = await crawlTrees(fakeFetcher(people, pedigrees), ["AAAA-R01"], options);
    const root = bundle?.persons.find((p) => p.id === "AAAA-R01");
    expect(root?.parents).toEqual(["AAAA-F01"]);
    const father = bundle?.persons.find((p) => p.id === "AAAA-F01");
    expect(father?.sources).toEqual([
      { id: "SRC1-001", title: "Метрична книга", url: "https://example.test/ark/1", date: "1922" },
    ]);
  });

  it("enters an unknown person the owner allows by id", async () => {
    const [bundle] = await crawlTrees(fakeFetcher(people, pedigrees), ["AAAA-R01"], {
      ...options,
      allow: new Set(["AAAA-G01"]),
    });
    expect(bundle?.persons.map((p) => p.id)).toContain("AAAA-G01");
  });

  it("fetches a person met in two trees once", async () => {
    const fetcher = fakeFetcher(people, {
      ...pedigrees,
      "AAAA-F01": [[["AAAA-F01", null]], [["AAAA-G01", null]]],
    });
    const bundles = await crawlTrees(fetcher, ["AAAA-R01", "AAAA-F01"], options);
    expect(bundles.map((b) => b.root)).toEqual(["AAAA-R01", "AAAA-F01"]);
    expect(fetcher.calls.filter((c) => c === "details AAAA-F01")).toHaveLength(1);
    expect(bundles[1]?.persons.map((p) => p.id)).toEqual(["AAAA-F01"]);
  });

  it("goes on from the last generation of a full pedigree", async () => {
    // Eight generations of one line: AAAA-L00 … AAAA-L07; L07 has parents further.
    const line = Array.from({ length: 9 }, (_, i) => `AAAA-L0${String(i)}`);
    const chain: FakePerson[] = line.map((id, i) => ({
      id,
      name: `Предок${String(i)}`,
      death: true,
      birth: "+1700",
    }));
    const rows: Pedigree = line.slice(0, 8).map((id) => [[id, null]]);
    const fetcher = fakeFetcher(chain, {
      "AAAA-L00": rows,
      "AAAA-L07": [[["AAAA-L07", null]], [["AAAA-L08", null]]],
    });
    // The fake pedigree carries no `parent1ParentIds`, so patch the reply the way the site sends it.
    const original = fetcher.pedigree.bind(fetcher);
    fetcher.pedigree = async (root) => {
      const reply = await original(root);
      if (root !== "AAAA-L00" || typeof reply !== "object" || reply === null) return reply;
      const copy = structuredClone(reply) as { ancestors: { parent1ParentIds?: unknown }[][] };
      const last = copy.ancestors[7]?.[0];
      if (last !== undefined) last.parent1ParentIds = { parent1Id: "AAAA-L08" };
      return copy;
    };
    const [bundle] = await crawlTrees(fetcher, ["AAAA-L00"], options);
    expect(bundle?.persons.map((p) => p.id)).toContain("AAAA-L08");
    expect(fetcher.calls).toContain("pedigree AAAA-L07");
  });
});
