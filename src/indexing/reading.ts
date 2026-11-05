// The JSON an agent writes for one scan. It is the only way data get into the case database.
import { z } from "zod";
import { attributeTypeByCode } from "./attribute-types.ts";
import { BOX_ORIGINS, DOUBT_ELEMENTS, GENDERS, PLACE_TYPES, TIE_TYPES } from "./enums.ts";

const key = z.string().min(1);

/** A name part is the most plausible full form: no sign of doubt (that is what a doubt is for). */
export const namePart = z
  .string()
  .min(1)
  .refine((value) => !/[?…]|\.\.\./.test(value), {
    message: "a name must be a full variant without «?» or «…»; put doubts in `doubts`",
  });

export const boxSchema = z.strictObject({
  x: z.int().min(0),
  y: z.int().min(0),
  w: z.int().positive(),
  h: z.int().positive(),
  origin: z.enum(BOX_ORIGINS).default("crop"),
});

/** A fact without a column, as in the well: an attribute type (its code) and the value as written. */
const attributeSchema = z.strictObject({
  type: z.string().refine((code) => attributeTypeByCode(code) !== undefined, {
    message: "unknown attribute type (see attribute-types.ts of the well)",
  }),
  value: z.string().min(1),
  box: boxSchema.optional(),
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
  given: namePart.optional(),
  patronymic: namePart.optional(),
  surname: namePart.optional(),
  gender: z.enum(GENDERS).optional(),
  /** Whole years are turned into a birth range; other forms («1/2») are kept as written. */
  age: z.union([z.int().min(0), z.string().min(1)]).optional(),
  given_box: boxSchema.optional(),
  patronymic_box: boxSchema.optional(),
  surname_box: boxSchema.optional(),
  /** Occupation, status, serial number, notes … */
  attributes: z.array(attributeSchema).default([]),
  ...provenance,
});

const tieSchema = z.strictObject({
  /** A key of this household, or `@head` / `@spouse` of the continued household. */
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
  /** Attributes of the household event (of the continued one for a continuation). */
  attributes: z.array(attributeSchema).default([]),
  members: z.array(memberSchema).min(1),
  ties: z.array(tieSchema).default([]),
  /**
   * The household began at the end of an earlier scan: these members belong to it (no head, no
   * new event). Ties may name its head and spouse as `@head` and `@spouse`.
   */
  continues: z.strictObject({ scan: z.string().min(1), household: key }).optional(),
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
  /** Id of the source (the case) in the well, pulled into the case database before. */
  source: z.int().positive().optional(),
  /** Attributes of the scan itself (an empty page, a title, a repeat): `note` and the like. */
  scan_attributes: z.array(attributeSchema).default([]),
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
