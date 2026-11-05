// Walks the ancestors of the roots of FamilySearch trees through a fetcher and keeps a record for
// every person that may be entered. Nothing here knows how the replies are fetched (`browser.ts`)
// or stored; a living person, or one whose state is unknown, leaves only an id and a reason.
import {
  detailsSchema,
  entityRefsSchema,
  pedigreeSchema,
  sourceLinksSchema,
  type Pedigree,
} from "./api.ts";
import type { Excluded, TreeBundle, TreePerson } from "./model.ts";
import { livingOf, readPerson } from "./parse.ts";

/** One reply per call; JSON as it came, validated here. A missing thing is `null`. */
export interface TreeFetcher {
  pedigree(root: string): Promise<unknown>;
  details(id: string): Promise<unknown>;
  sourceRefs(id: string): Promise<unknown>;
  sourceLinks(sourceIds: readonly string[]): Promise<unknown>;
}

export interface CrawlOptions {
  /** The year the living rule counts from. */
  readonly referenceYear: number;
  /** ISO time written into the bundles. */
  readonly fetchedAt: string;
  /** Persons to enter although the rule keeps them out; the owner decides, by id. */
  readonly allow?: ReadonlySet<string>;
}

/** FamilySearch gives at most eight generations in one call. */
const MAX_GENERATIONS = 8;

/** Ids of the ancestors in the pedigree of `root`, and those whose own parents lie further. */
function pedigreeIds(pedigree: Pedigree): {
  living: Set<string>;
  alive: Set<string>;
  deeper: Set<string>;
} {
  const living = new Set<string>();
  const alive = new Set<string>();
  const deeper = new Set<string>();
  const last = pedigree.ancestors.length - 1;
  pedigree.ancestors.forEach((generation, index) => {
    for (const couple of generation) {
      for (const [parent, parentIds] of [
        [couple.parent1, couple.parent1ParentIds],
        [couple.parent2, couple.parent2ParentIds],
      ] as const) {
        if (parent == null) continue;
        if (parent.living) {
          living.add(parent.id);
          continue;
        }
        alive.add(parent.id);
        const hasParents = parentIds?.parent1Id != null || parentIds?.parent2Id != null;
        if (index === last && pedigree.ancestors.length >= MAX_GENERATIONS && hasParents) {
          deeper.add(parent.id);
        }
      }
    }
  });
  return { living, alive, deeper };
}

/** The ancestors of `root`, as ids, beyond eight generations too; `root` itself is included. */
async function ancestorsOf(
  fetcher: TreeFetcher,
  root: string,
): Promise<{ ids: Set<string>; living: Set<string> }> {
  const ids = new Set<string>([root]);
  const living = new Set<string>();
  const rooted = new Set<string>();
  const queue = [root];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (rooted.has(next)) continue;
    rooted.add(next);
    const reply = await fetcher.pedigree(next);
    if (reply === null)
      throw new Error(`no pedigree for ${next}: not logged in, or no such person`);
    const found = pedigreeIds(pedigreeSchema.parse(reply));
    for (const id of found.alive) ids.add(id);
    for (const id of found.living) living.add(id);
    queue.push(...found.deeper);
  }
  return { ids, living };
}

async function attachSources(fetcher: TreeFetcher, id: string): Promise<TreePerson["sources"]> {
  const refs = entityRefsSchema.parse(await fetcher.sourceRefs(id));
  const sourceIds = refs.entityRefs
    .filter((r) => r.value.type === "SOURCE")
    .map((r) => r.value.uri);
  if (sourceIds.length === 0) return [];
  const links = sourceLinksSchema.parse(await fetcher.sourceLinks(sourceIds));
  return links.sources.flatMap((s) => {
    const title = s.title?.trim();
    if (title === undefined || title === "") return [];
    const date = s.event?.originalDate?.trim();
    return [
      {
        id: s.id,
        title,
        url: s.uri?.uri ?? null,
        date: date === undefined || date === "" ? null : date,
      },
    ];
  });
}

type Judged = { kind: "person"; person: TreePerson } | { kind: "excluded"; excluded: Excluded };

/**
 * Fetches the trees of `roots`. A person met in two trees is fetched once and is the same record
 * in both bundles.
 */
export async function crawlTrees(
  fetcher: TreeFetcher,
  roots: readonly string[],
  options: CrawlOptions,
): Promise<TreeBundle[]> {
  const judged = new Map<string, Judged>();
  const judge = async (id: string): Promise<Judged> => {
    const known = judged.get(id);
    if (known !== undefined) return known;
    const reply = await fetcher.details(id);
    if (reply === null) throw new Error(`no details for ${id}`);
    const details = detailsSchema.parse(reply);
    const state = livingOf(details, options.referenceYear);
    let result: Judged;
    if (state === "dead" || options.allow?.has(id) === true) {
      const person = readPerson(details);
      const sources =
        (details.sourceCount ?? 0) > 0 ? await attachSources(fetcher, id) : person.sources;
      result = { kind: "person", person: { ...person, sources } };
    } else {
      result = {
        kind: "excluded",
        excluded: { id, reason: state === "living" ? "living" : "unknown" },
      };
    }
    judged.set(id, result);
    return result;
  };

  const bundles: TreeBundle[] = [];
  for (const root of roots) {
    const { ids, living } = await ancestorsOf(fetcher, root);
    const persons: TreePerson[] = [];
    const excluded = new Map<string, Excluded>();
    for (const id of living) excluded.set(id, { id, reason: "living" });
    for (const id of ids) {
      const result = await judge(id);
      if (result.kind === "person") persons.push(result.person);
      else excluded.set(id, result.excluded);
    }
    // A relative that was kept out must not stay even as an id.
    const kept = new Set(persons.map((p) => p.id));
    bundles.push({
      root,
      fetchedAt: options.fetchedAt,
      referenceYear: options.referenceYear,
      persons: persons
        .map((p) => ({
          ...p,
          parents: p.parents.filter((id) => kept.has(id)),
          spouses: p.spouses.filter((s) => kept.has(s.id)),
        }))
        .toSorted((a, b) => a.id.localeCompare(b.id)),
      excluded: [...excluded.values()].toSorted((a, b) => a.id.localeCompare(b.id)),
    });
  }
  return bundles;
}
