// Hints for reading a scan: what the case database already knows. Only this database is looked at:
// a case keeps its dictionary and its names apart from every other case.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { selectRows } from "./db.ts";

export const NAME_KINDS = ["given", "patronymic", "surname"] as const;
export type NameKind = (typeof NAME_KINDS)[number];

/** The kind named on the command line; undefined when none is named, an error for any other. */
export function parseNameKind(value: string | undefined): NameKind | undefined {
  if (value === undefined) return undefined;
  const kind = NAME_KINDS.find((candidate) => candidate === value);
  if (kind === undefined) {
    throw new Error(`kind must be given, patronymic or surname: ${value}`);
  }
  return kind;
}

export interface DictionaryHint {
  readonly kind: string;
  readonly word: string;
  readonly canon: string | null;
  readonly note: string | null;
}

export interface NameHint {
  readonly kind: NameKind;
  readonly text: string;
  /** How many persons of the case carry it, in all runs. */
  readonly count: number;
}

export interface CaseHints {
  readonly dictionary: readonly DictionaryHint[];
  /** By kind, then the most frequent first. */
  readonly names: readonly NameHint[];
}

const dictionaryRow = z.object({
  kind: z.string(),
  word: z.string(),
  canon: z.string().nullable(),
  note: z.string().nullable(),
});
const nameRow = z.object({ text: z.string(), count: z.number() });

/**
 * The dictionary of the case and the distinct given names, patronymics and surnames of its persons
 * (as they stand now, with the fixes of the review), with how often each occurs. `kind` narrows
 * both to one kind of word.
 */
export function caseHints(db: DatabaseSync, options: { readonly kind?: NameKind } = {}): CaseHints {
  const kinds = options.kind === undefined ? NAME_KINDS : [options.kind];
  const dictionary = selectRows(
    db,
    dictionaryRow,
    `select kind, word, canon, note from dict_entry
      ${options.kind === undefined ? "" : "where kind = ?"} order by kind, word`,
    options.kind === undefined ? [] : [options.kind],
  );
  const names = kinds.flatMap((kind) =>
    // `kind` is one of the three column names of `person`, never user text.
    selectRows(
      db,
      nameRow,
      `select ${kind} as text, count(*) as count from person where ${kind} is not null
        group by ${kind} order by count(*) desc, ${kind}`,
    ).map((row) => ({ kind, text: row.text, count: row.count })),
  );
  return { dictionary, names };
}

const KIND_TITLES: Readonly<Record<NameKind, string>> = {
  given: "Імена",
  patronymic: "По батькові",
  surname: "Прізвища",
};

/** The hints as text for the agent: the dictionary first, then every kind of name. */
export function formatHints(hints: CaseHints): string {
  const lines: string[] = [`# Словник справи (${String(hints.dictionary.length)})`];
  for (const entry of hints.dictionary) {
    lines.push([entry.kind, entry.word, entry.canon ?? "", entry.note ?? ""].join("\t"));
  }
  for (const kind of NAME_KINDS) {
    const names = hints.names.filter((name) => name.kind === kind);
    // A kind that was not asked for, or has nothing read yet, gets no empty section.
    if (names.length === 0) continue;
    lines.push("", `# ${KIND_TITLES[kind]}, різних: ${String(names.length)}`);
    for (const name of names) lines.push(`${String(name.count)}\t${name.text}`);
  }
  return `${lines.join("\n")}\n`;
}
