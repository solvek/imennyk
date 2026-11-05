// What the import keeps of a FamilySearch person: a sanitized record. The raw replies hold other
// people (living children and relatives in family lists) and never reach the disk; only these
// records do, and only for persons that may be entered (`living.ts`).
import { z } from "zod";
import { DATE_QUALS, GENDERS } from "../../indexing/enums.ts";

export const treeDateSchema = z.strictObject({
  /** First and last day, `YYYY-MM-DD`. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  qual: z.enum(DATE_QUALS),
});

export const treePlaceSchema = z.strictObject({
  /** The FamilySearch standard place id: the same id is the same place. */
  id: z.int().nullable(),
  /** The place as the contributor wrote it. */
  name: z.string().min(1),
  /** The FamilySearch standardised name (Latin letters). */
  standard: z.string().min(1).nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

export const treeEventSchema = z.strictObject({
  date: treeDateSchema.nullable(),
  /** The date as written, kept when it is not read into bounds (before, after, a range …). */
  dateText: z.string().min(1).nullable(),
  place: treePlaceSchema.nullable(),
});

export const treePersonSchema = z.strictObject({
  /** The FamilySearch person id, e.g. `GG22-75Z`. */
  id: z.string().regex(/^[0-9A-Z]{4}-[0-9A-Z]{3,4}$/),
  gender: z.enum(GENDERS).nullable(),
  given: z.string().min(1).nullable(),
  patronymic: z.string().min(1).nullable(),
  surname: z.string().min(1).nullable(),
  /** The name in Latin letters FamilySearch keeps beside the Ukrainian one. */
  latin: z.string().min(1).nullable(),
  birth: treeEventSchema.nullable(),
  death: treeEventSchema.nullable(),
  /** Ids of the parents (both parents of every family the person is a child in). */
  parents: z.array(z.string()),
  spouses: z.array(z.strictObject({ id: z.string(), marriage: treeEventSchema.nullable() })),
  /** Sources attached to the person in the tree (archive records and the like). */
  sources: z.array(
    z.strictObject({
      id: z.string(),
      title: z.string().min(1),
      url: z.string().min(1).nullable(),
      date: z.string().min(1).nullable(),
    }),
  ),
});

/** A person kept out, and why; no names, so the file holds nothing about a living person. */
export const excludedSchema = z.strictObject({
  id: z.string(),
  reason: z.enum(["living", "unknown"]),
});

/** The result of fetching one tree (the ancestors of a root). */
export const treeBundleSchema = z.strictObject({
  root: z.string(),
  /** ISO time of the fetch. */
  fetchedAt: z.string(),
  /** The year the living rule counted from. */
  referenceYear: z.int(),
  persons: z.array(treePersonSchema),
  excluded: z.array(excludedSchema),
});

export type TreeDate = z.infer<typeof treeDateSchema>;
export type TreePlace = z.infer<typeof treePlaceSchema>;
export type TreeEvent = z.infer<typeof treeEventSchema>;
export type TreePerson = z.infer<typeof treePersonSchema>;
export type Excluded = z.infer<typeof excludedSchema>;
export type TreeBundle = z.infer<typeof treeBundleSchema>;
