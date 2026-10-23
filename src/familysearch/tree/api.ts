// The parts of the FamilySearch tree API replies that the import reads, validated at the boundary.
// Everything else in a reply is ignored here and never stored.
import { z } from "zod";

const nullish = <T extends z.ZodType>(schema: T) => schema.nullish();

/** A person as the pedigree and the family lists summarise them. */
export const summarySchema = z.looseObject({
  id: z.string().min(1),
  living: z.boolean(),
  gender: nullish(z.string()),
  lifespan: nullish(z.string()),
});
export type Summary = z.infer<typeof summarySchema>;

const parentIds = z.looseObject({
  parent1Id: nullish(z.string()),
  parent2Id: nullish(z.string()),
});

const coupleSchema = z.looseObject({
  parent1: nullish(summarySchema),
  parent2: nullish(summarySchema),
  parent1ParentIds: nullish(parentIds),
  parent2ParentIds: nullish(parentIds),
});

/** `portrait-pedigree`: ancestors by generation (1 = parents), at most 8 generations. */
export const pedigreeSchema = z.looseObject({
  ancestors: z.array(z.array(coupleSchema)),
});
export type Pedigree = z.infer<typeof pedigreeSchema>;

const placeSchema = z.looseObject({
  id: nullish(z.number()),
  originalText: nullish(z.string()),
  normalizedText: nullish(z.string()),
  geoCode: nullish(z.looseObject({ latitude: z.number(), longitude: z.number() })),
});

const dateSchema = z.looseObject({
  formalText: nullish(z.string()),
  originalText: nullish(z.string()),
  normalizedText: nullish(z.string()),
  modifier: nullish(z.string()),
});

export const factSchema = z.looseObject({
  details: z.looseObject({
    date: nullish(dateSchema),
    place: nullish(placeSchema),
  }),
});
export type Fact = z.infer<typeof factSchema>;

const nameFormSchema = z.looseObject({
  lang: nullish(z.string()),
  givenPart: nullish(z.string()),
  familyPart: nullish(z.string()),
  fullText: nullish(z.string()),
});

const familySchema = z.looseObject({
  parent1: nullish(summarySchema),
  parent2: nullish(summarySchema),
  preferred: nullish(z.boolean()),
  event: nullish(factSchema),
});

/** `v8/person/<id>/details`. */
export const detailsSchema = z.looseObject({
  id: z.string().min(1),
  living: z.boolean(),
  gender: nullish(z.string()),
  sourceCount: nullish(z.number()),
  birth: nullish(factSchema),
  death: nullish(factSchema),
  nameConclusion: nullish(
    z.looseObject({
      details: z.looseObject({ nameForms: z.array(nameFormSchema) }),
    }),
  ),
  parents: z.array(familySchema).default([]),
  spouses: z.array(familySchema).default([]),
});
export type Details = z.infer<typeof detailsSchema>;

/** `tf/person/<id>/entityref`: the ids of the sources attached to a person. */
export const entityRefsSchema = z.looseObject({
  entityRefs: z
    .array(z.looseObject({ value: z.looseObject({ type: z.string(), uri: z.string() }) }))
    .default([]),
});

/** `links/sources/<ids>`: the attached sources. */
export const sourceLinksSchema = z.looseObject({
  sources: z
    .array(
      z.looseObject({
        id: z.string(),
        title: nullish(z.string()),
        uri: nullish(z.looseObject({ uri: nullish(z.string()) })),
        event: nullish(z.looseObject({ originalDate: nullish(z.string()) })),
      }),
    )
    .default([]),
});
