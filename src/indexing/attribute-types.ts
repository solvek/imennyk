/**
 * Attribute types are constants in code (ddb-model.md, «Типи атрибутів»).
 * `attribute.type` stores the fixed id. Ids never change and are never reused.
 */

export type AttributeFormat = "text" | "markdown";

export interface AttributeTypeDef {
  readonly id: number;
  readonly code: string;
  readonly label: { readonly uk: string; readonly en: string };
  readonly format: AttributeFormat;
}

/** Fixed ids 1–18; do not renumber. */
export const ATTRIBUTE_TYPES = [
  {
    id: 1,
    code: "religion",
    label: { uk: "Віросповідання", en: "Religion" },
    format: "text",
  },
  {
    id: 2,
    code: "status",
    label: { uk: "Стан", en: "Status" },
    format: "text",
  },
  {
    id: 3,
    code: "occupation",
    label: { uk: "Заняття", en: "Occupation" },
    format: "text",
  },
  {
    id: 4,
    code: "cause",
    label: { uk: "Причина смерті", en: "Cause of death" },
    format: "markdown",
  },
  {
    id: 5,
    code: "author",
    label: { uk: "Автор", en: "Author" },
    format: "markdown",
  },
  {
    id: 6,
    code: "pubinfo",
    label: { uk: "Вихідні дані", en: "Publication info" },
    format: "markdown",
  },
  {
    id: 7,
    code: "address",
    label: { uk: "Адреса", en: "Address" },
    format: "markdown",
  },
  {
    id: 8,
    code: "note",
    label: { uk: "Нотатка", en: "Note" },
    format: "markdown",
  },
  {
    id: 9,
    code: "url",
    label: { uk: "Посилання", en: "URL" },
    format: "text",
  },
  {
    id: 10,
    code: "parts",
    label: { uk: "Частини", en: "Parts" },
    format: "text",
  },
  {
    id: 11,
    code: "scan",
    label: { uk: "Скан", en: "Scan" },
    format: "text",
  },
  {
    id: 12,
    code: "research",
    label: { uk: "Дослідження", en: "Research" },
    format: "markdown",
  },
  {
    id: 13,
    code: "yaml",
    label: { uk: "YAML", en: "YAML" },
    format: "text",
  },
  {
    id: 14,
    code: "nationality",
    label: { uk: "Національність", en: "Nationality" },
    format: "text",
  },
  {
    id: 15,
    code: "nick",
    label: { uk: "Прізвисько", en: "Nickname" },
    format: "text",
  },
  {
    id: 16,
    code: "y_haplogroup",
    label: { uk: "Y-гаплогрупа", en: "Y haplogroup" },
    format: "text",
  },
  {
    id: 17,
    code: "index",
    label: { uk: "Індекс", en: "Index" },
    format: "text",
  },
  {
    id: 18,
    code: "marital",
    label: { uk: "Сімейний стан", en: "Marital status" },
    format: "text",
  },
] as const satisfies readonly AttributeTypeDef[];

export type AttributeCode = (typeof ATTRIBUTE_TYPES)[number]["code"];

/** Id of each type by code. */
export const ATTR = Object.fromEntries(ATTRIBUTE_TYPES.map((t) => [t.code, t.id])) as Record<
  AttributeCode,
  number
>;

const BY_ID = new Map<number, (typeof ATTRIBUTE_TYPES)[number]>(
  ATTRIBUTE_TYPES.map((t) => [t.id, t]),
);
const BY_CODE = new Map<string, (typeof ATTRIBUTE_TYPES)[number]>(
  ATTRIBUTE_TYPES.map((t) => [t.code, t]),
);

/** The type with this id, or undefined when the id is not in the vocabulary. */
export function attributeTypeById(id: number): (typeof ATTRIBUTE_TYPES)[number] | undefined {
  return BY_ID.get(id);
}

/** The type with this code, or undefined when the code is not in the vocabulary. */
export function attributeTypeByCode(code: string): (typeof ATTRIBUTE_TYPES)[number] | undefined {
  return BY_CODE.get(code);
}

/** The fixed id of `code`. Throws when the code is not in the vocabulary. */
export function attributeTypeId(code: string): number {
  const type = BY_CODE.get(code);
  if (type === undefined) {
    throw new Error(`unknown attribute type: ${code}`);
  }
  return type.id;
}

/**
 * Ids of the given codes. Throws if any code is unknown — same contract as the former
 * `attributeTypeIds` that read `ddb.attribute_type`.
 */
export function attributeTypeIds(codes: Iterable<string>): Map<string, number> {
  const wanted = [...new Set(codes)];
  const ids = new Map<string, number>();
  const unknown: string[] = [];
  for (const code of wanted) {
    const type = BY_CODE.get(code);
    if (type === undefined) {
      unknown.push(code);
    } else {
      ids.set(code, type.id);
    }
  }
  if (unknown.length > 0) {
    throw new Error(`unknown attribute type: ${unknown.join(", ")}`);
  }
  return ids;
}

/** The id of `code` from a map made by `attributeTypeIds`. */
export function typeId(ids: ReadonlyMap<string, number>, code: string): number {
  const id = ids.get(code);
  if (id === undefined) {
    throw new Error(`unknown attribute type: ${code}`);
  }
  return id;
}
