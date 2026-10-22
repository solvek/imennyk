// The JSON an agent writes for one scan. It is the only way data get into the case database.
import { z } from "zod";
import { BOX_ORIGINS, DOUBT_ELEMENTS, GENDERS, PLACE_TYPES, TIE_TYPES } from "./enums.ts";

const key = z.string().min(1);

export const boxSchema = z.strictObject({
  x: z.int().min(0),
  y: z.int().min(0),
  w: z.int().positive(),
  h: z.int().positive(),
  origin: z.enum(BOX_ORIGINS).default("crop"),
});

const provenance = {
  /** Rectangle of the scan the data were read from. */
  box: boxSchema.optional(),
  /** Key of a text line of this reading. */
  line: key.optional(),
};

const memberSchema = z.strictObject({
  key,
  /** The head of the household: the main person of the confession event. */
  head: z.boolean().default(false),
  given: z.string().min(1).optional(),
  patronymic: z.string().min(1).optional(),
  surname: z.string().min(1).optional(),
  gender: z.enum(GENDERS).optional(),
  /** Whole years are turned into a birth range; other forms («1/2») are kept as written. */
  age: z.union([z.int().min(0), z.string().min(1)]).optional(),
  given_box: boxSchema.optional(),
  patronymic_box: boxSchema.optional(),
  surname_box: boxSchema.optional(),
  note: z.string().min(1).optional(),
  ...provenance,
});

const tieSchema = z.strictObject({
  person: key,
  other: key,
  type: z.enum(TIE_TYPES),
  relation: z.string().min(1).optional(),
  up: z.int().min(0).optional(),
  down: z.int().min(0).optional(),
  ...provenance,
});

const householdSchema = z.strictObject({
  key,
  number: z.string().min(1).optional(),
  place: key.optional(),
  note: z.string().min(1).optional(),
  members: z.array(memberSchema).min(1),
  ties: z.array(tieSchema).default([]),
  ...provenance,
});

const doubtSchema = z.strictObject({
  element: z.enum(DOUBT_ELEMENTS),
  person: key.optional(),
  place: key.optional(),
  /** The word as read; empty only for an unreadable one with its visible letters in `note`. */
  read: z.string().min(1).optional(),
  variants: z.string().min(1).optional(),
  unreadable: z.boolean().default(false),
  note: z.string().min(1).optional(),
  box: boxSchema.optional(),
});

export const readingSchema = z.strictObject({
  /** Name of a scan already added to the database. */
  scan: z.string().min(1),
  /** Year of the document: the base of ages. */
  year: z.int(),
  lines: z
    .array(z.strictObject({ key, text: z.string().min(1), box: boxSchema.optional() }))
    .default([]),
  places: z
    .array(
      z.strictObject({
        key,
        name: z.string().min(1),
        type: z.enum(PLACE_TYPES).optional(),
        ...provenance,
      }),
    )
    .default([]),
  households: z.array(householdSchema).default([]),
  doubts: z.array(doubtSchema).default([]),
  /** Words of this case only; a word already there is kept as it is. */
  dictionary: z
    .array(
      z.strictObject({
        kind: z.enum(["given", "patronymic", "surname", "place", "abbreviation", "other"]),
        word: z.string().min(1),
        canon: z.string().min(1).optional(),
        note: z.string().min(1).optional(),
      }),
    )
    .default([]),
});

export type Box = z.infer<typeof boxSchema>;
export type Reading = z.infer<typeof readingSchema>;
