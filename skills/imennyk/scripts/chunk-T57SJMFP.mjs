// Built by `pnpm build:skill` from src/; do not edit by hand.
import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);
import {
  BOX_ORIGINS,
  DOUBT_ELEMENTS,
  GENDERS,
  PLACE_TYPES,
  TIE_TYPES,
  external_exports
} from "./chunk-IPSGNSK4.mjs";

// src/indexing/attribute-types.ts
var ATTRIBUTE_TYPES = [
  {
    id: 1,
    code: "religion",
    label: { uk: "\u0412\u0456\u0440\u043E\u0441\u043F\u043E\u0432\u0456\u0434\u0430\u043D\u043D\u044F", en: "Religion" },
    format: "text"
  },
  {
    id: 2,
    code: "status",
    label: { uk: "\u0421\u0442\u0430\u043D", en: "Status" },
    format: "text"
  },
  {
    id: 3,
    code: "occupation",
    label: { uk: "\u0417\u0430\u043D\u044F\u0442\u0442\u044F", en: "Occupation" },
    format: "text"
  },
  {
    id: 4,
    code: "cause",
    label: { uk: "\u041F\u0440\u0438\u0447\u0438\u043D\u0430 \u0441\u043C\u0435\u0440\u0442\u0456", en: "Cause of death" },
    format: "markdown"
  },
  {
    id: 5,
    code: "author",
    label: { uk: "\u0410\u0432\u0442\u043E\u0440", en: "Author" },
    format: "markdown"
  },
  {
    id: 6,
    code: "pubinfo",
    label: { uk: "\u0412\u0438\u0445\u0456\u0434\u043D\u0456 \u0434\u0430\u043D\u0456", en: "Publication info" },
    format: "markdown"
  },
  {
    id: 7,
    code: "address",
    label: { uk: "\u0410\u0434\u0440\u0435\u0441\u0430", en: "Address" },
    format: "markdown"
  },
  {
    id: 8,
    code: "note",
    label: { uk: "\u041D\u043E\u0442\u0430\u0442\u043A\u0430", en: "Note" },
    format: "markdown"
  },
  {
    id: 9,
    code: "url",
    label: { uk: "\u041F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F", en: "URL" },
    format: "text"
  },
  {
    id: 10,
    code: "parts",
    label: { uk: "\u0427\u0430\u0441\u0442\u0438\u043D\u0438", en: "Parts" },
    format: "text"
  },
  {
    id: 11,
    code: "scan",
    label: { uk: "\u0421\u043A\u0430\u043D", en: "Scan" },
    format: "text"
  },
  {
    id: 12,
    code: "research",
    label: { uk: "\u0414\u043E\u0441\u043B\u0456\u0434\u0436\u0435\u043D\u043D\u044F", en: "Research" },
    format: "markdown"
  },
  {
    id: 13,
    code: "yaml",
    label: { uk: "YAML", en: "YAML" },
    format: "text"
  },
  {
    id: 14,
    code: "nationality",
    label: { uk: "\u041D\u0430\u0446\u0456\u043E\u043D\u0430\u043B\u044C\u043D\u0456\u0441\u0442\u044C", en: "Nationality" },
    format: "text"
  },
  {
    id: 15,
    code: "nick",
    label: { uk: "\u041F\u0440\u0456\u0437\u0432\u0438\u0441\u044C\u043A\u043E", en: "Nickname" },
    format: "text"
  },
  {
    id: 16,
    code: "y_haplogroup",
    label: { uk: "Y-\u0433\u0430\u043F\u043B\u043E\u0433\u0440\u0443\u043F\u0430", en: "Y haplogroup" },
    format: "text"
  },
  {
    id: 17,
    code: "index",
    label: { uk: "\u0406\u043D\u0434\u0435\u043A\u0441", en: "Index" },
    format: "text"
  },
  {
    id: 18,
    code: "marital",
    label: { uk: "\u0421\u0456\u043C\u0435\u0439\u043D\u0438\u0439 \u0441\u0442\u0430\u043D", en: "Marital status" },
    format: "text"
  },
  {
    id: 19,
    code: "serial",
    label: { uk: "\u041F\u043E\u0440\u044F\u0434\u043A\u043E\u0432\u0438\u0439 \u043D\u043E\u043C\u0435\u0440", en: "Serial number" },
    format: "text"
  },
  {
    id: 20,
    code: "ext_id",
    label: { uk: "\u0417\u043E\u0432\u043D\u0456\u0448\u043D\u0456\u0439 \u0456\u0434\u0435\u043D\u0442\u0438\u0444\u0456\u043A\u0430\u0442\u043E\u0440", en: "External ID" },
    format: "text"
  },
  {
    id: 21,
    code: "origin",
    label: { uk: "\u0417\u0432\u0456\u0434\u043A\u0438 \u0432\u0437\u044F\u0442\u043E", en: "Origin" },
    format: "markdown"
  }
];
var ATTR = Object.fromEntries(ATTRIBUTE_TYPES.map((t) => [t.code, t.id]));
var BY_ID = new Map(
  ATTRIBUTE_TYPES.map((t) => [t.id, t])
);
var BY_CODE = new Map(
  ATTRIBUTE_TYPES.map((t) => [t.code, t])
);
function attributeTypeByCode(code) {
  return BY_CODE.get(code);
}

// src/indexing/reading.ts
var key = external_exports.string().min(1);
var namePart = external_exports.string().min(1).refine((value) => !/[?…]|\.\.\./.test(value), {
  message: "a name must be a full variant without \xAB?\xBB or \xAB\u2026\xBB; put doubts in `doubts`"
});
var boxSchema = external_exports.strictObject({
  x: external_exports.int().min(0),
  y: external_exports.int().min(0),
  w: external_exports.int().positive(),
  h: external_exports.int().positive(),
  origin: external_exports.enum(BOX_ORIGINS).default("crop")
});
var attributeSchema = external_exports.strictObject({
  type: external_exports.string().refine((code) => attributeTypeByCode(code) !== void 0, {
    message: "unknown attribute type (see attribute-types.ts of the well)"
  }),
  value: external_exports.string().min(1),
  box: boxSchema.optional()
});
var provenance = {
  /** Rectangle of the scan the data were read from. */
  box: boxSchema.optional(),
  /** Key of a text line of this reading. */
  line: key.optional()
};
var memberSchema = external_exports.strictObject({
  key,
  /** The head of the household: the main person of the confession event. */
  head: external_exports.boolean().default(false),
  given: namePart.optional(),
  patronymic: namePart.optional(),
  surname: namePart.optional(),
  gender: external_exports.enum(GENDERS).optional(),
  /** Whole years are turned into a birth range; other forms («1/2») are kept as written. */
  age: external_exports.union([external_exports.int().min(0), external_exports.string().min(1)]).optional(),
  given_box: boxSchema.optional(),
  patronymic_box: boxSchema.optional(),
  surname_box: boxSchema.optional(),
  /** Occupation, status, serial number, notes … */
  attributes: external_exports.array(attributeSchema).default([]),
  ...provenance
});
var tieSchema = external_exports.strictObject({
  /** A key of this household, or `@head` / `@spouse` of the continued household. */
  person: key,
  other: key,
  type: external_exports.enum(TIE_TYPES),
  relation: external_exports.string().min(1).optional(),
  up: external_exports.int().min(0).optional(),
  down: external_exports.int().min(0).optional(),
  ...provenance
});
var householdSchema = external_exports.strictObject({
  key,
  number: external_exports.string().min(1).optional(),
  place: key.optional(),
  /** Attributes of the household event (of the continued one for a continuation). */
  attributes: external_exports.array(attributeSchema).default([]),
  members: external_exports.array(memberSchema).min(1),
  ties: external_exports.array(tieSchema).default([]),
  /**
   * The household began at the end of an earlier scan: these members belong to it (no head, no
   * new event). Ties may name its head and spouse as `@head` and `@spouse`.
   */
  continues: external_exports.strictObject({ scan: external_exports.string().min(1), household: key }).optional(),
  ...provenance
});
var doubtSchema = external_exports.strictObject({
  element: external_exports.enum(DOUBT_ELEMENTS),
  person: key.optional(),
  place: key.optional(),
  /** The word as read; empty only for an unreadable one with its visible letters in `note`. */
  read: external_exports.string().min(1).optional(),
  variants: external_exports.string().min(1).optional(),
  unreadable: external_exports.boolean().default(false),
  note: external_exports.string().min(1).optional(),
  box: boxSchema.optional()
});
var readingSchema = external_exports.strictObject({
  /** Name of a scan already added to the database. */
  scan: external_exports.string().min(1),
  /** Year of the document: the base of ages. */
  year: external_exports.int(),
  /** Id of the source (the case) in the well, pulled into the case database before. */
  source: external_exports.int().positive().optional(),
  /** Attributes of the scan itself (an empty page, a title, a repeat): `note` and the like. */
  scan_attributes: external_exports.array(attributeSchema).default([]),
  lines: external_exports.array(external_exports.strictObject({ key, text: external_exports.string().min(1), box: boxSchema.optional() })).default([]),
  places: external_exports.array(
    external_exports.strictObject({
      key,
      name: external_exports.string().min(1),
      type: external_exports.enum(PLACE_TYPES).optional(),
      ...provenance
    })
  ).default([]),
  households: external_exports.array(householdSchema).default([]),
  doubts: external_exports.array(doubtSchema).default([]),
  /** Words of this case only; a word already there is kept as it is. */
  dictionary: external_exports.array(
    external_exports.strictObject({
      kind: external_exports.enum(["given", "patronymic", "surname", "place", "abbreviation", "other"]),
      word: external_exports.string().min(1),
      canon: external_exports.string().min(1).optional(),
      note: external_exports.string().min(1).optional()
    })
  ).default([])
});

export {
  namePart,
  readingSchema
};
