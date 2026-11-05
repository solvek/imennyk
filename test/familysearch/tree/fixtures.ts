// Fictional replies of the FamilySearch tree API, in the shape the import reads.
import type { TreeFetcher } from "../../../src/genealogy/import/familysearch-tree/crawl.ts";

export function summary(
  id: string,
  extra: { living?: boolean; gender?: string } = {},
): Record<string, unknown> {
  return {
    id,
    living: extra.living ?? false,
    gender: extra.gender ?? "MALE",
    lifespan: "1900–1950",
  };
}

export function fact(input: {
  formalText?: string;
  originalDate?: string;
  modifier?: string;
  place?: { id: number; name: string; standard?: string };
}): { details: Record<string, unknown> } {
  return {
    details: {
      date:
        input.formalText === undefined && input.originalDate === undefined
          ? null
          : {
              formalText: input.formalText ?? null,
              originalText: input.originalDate ?? null,
              normalizedText: input.originalDate ?? null,
              modifier: input.modifier ?? null,
            },
      place:
        input.place === undefined
          ? null
          : {
              id: input.place.id,
              originalText: input.place.name,
              normalizedText: input.place.standard ?? input.place.name,
              geoCode: { latitude: 50.1, longitude: 24.2 },
            },
    },
  };
}

export interface FakePerson {
  readonly id: string;
  readonly living?: boolean;
  readonly name: string;
  readonly death?: boolean;
  readonly birth?: string;
  readonly parents?: readonly string[];
  readonly spouse?: string;
  readonly sources?: readonly { id: string; title: string; uri: string }[];
  readonly livingChild?: { id: string; name: string };
}

/** Ancestors by generation: couples of ids. */
export type Pedigree = readonly (readonly (readonly [string | null, string | null])[])[];

/** A fake fetcher over a few fictional people; `calls` lists what was asked. */
export function fakeFetcher(
  people: readonly FakePerson[],
  pedigrees: Readonly<Record<string, Pedigree>>,
): TreeFetcher & { calls: string[] } {
  const byId = new Map(people.map((p) => [p.id, p]));
  const calls: string[] = [];
  const summaryOf = (id: string) => {
    const p = byId.get(id);
    return summary(id, { living: p?.living ?? false });
  };
  return {
    calls,
    pedigree: (root) => {
      calls.push(`pedigree ${root}`);
      const rows = pedigrees[root];
      if (rows === undefined) return Promise.resolve(null);
      return Promise.resolve({
        ancestors: rows.map((generation) =>
          generation.map(([a, b]) => ({
            parent1: a === null ? null : summaryOf(a),
            parent2: b === null ? null : summaryOf(b),
          })),
        ),
      });
    },
    details: (id) => {
      calls.push(`details ${id}`);
      const p = byId.get(id);
      if (p === undefined) return Promise.resolve(null);
      return Promise.resolve({
        id,
        living: p.living ?? false,
        gender: "MALE",
        sourceCount: p.sources?.length ?? 0,
        birth: p.birth === undefined ? null : fact({ formalText: p.birth }),
        death: p.death === true ? fact({}) : null,
        nameConclusion: {
          details: { nameForms: [{ lang: "uk", givenPart: p.name, familyPart: "Тестовий" }] },
        },
        parents:
          p.parents === undefined
            ? []
            : [
                {
                  parent1: summaryOf(p.parents[0] ?? id),
                  parent2: p.parents[1] === undefined ? null : summaryOf(p.parents[1]),
                },
              ],
        spouses: [
          ...(p.spouse === undefined
            ? []
            : [{ parent1: summaryOf(id), parent2: summaryOf(p.spouse) }]),
          ...(p.livingChild === undefined
            ? []
            : [
                {
                  parent1: summaryOf(id),
                  parent2: null,
                  children: [
                    { child: { id: p.livingChild.id, name: p.livingChild.name, living: true } },
                  ],
                },
              ]),
        ],
      });
    },
    sourceRefs: (id) => {
      calls.push(`refs ${id}`);
      return Promise.resolve({
        entityRefs: (byId.get(id)?.sources ?? []).map((s) => ({
          value: { type: "SOURCE", uri: s.id },
        })),
      });
    },
    sourceLinks: (ids) => {
      calls.push(`links ${ids.join(",")}`);
      const all = people.flatMap((p) => p.sources ?? []);
      return Promise.resolve({
        sources: all
          .filter((s) => ids.includes(s.id))
          .map((s) => ({
            id: s.id,
            title: s.title,
            uri: { uri: s.uri },
            event: { originalDate: "1922" },
          })),
      });
    },
  };
}
