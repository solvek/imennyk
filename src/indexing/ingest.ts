// Writes the reading of one scan into the case database, in one transaction.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { inTransaction, selectRows } from "./db.ts";
import { type Box, type Reading, readingSchema } from "./reading.ts";

/** A word of the reading that the dictionary of the case kept as it was: it has another `canon`. */
export interface DictionarySkip {
  readonly kind: string;
  readonly word: string;
  /** The `canon` the dictionary has for the word; null when it has none. */
  readonly canon: string | null;
  /** The `canon` the reading offered. */
  readonly proposed: string;
}

export interface IngestResult {
  readonly lines: number;
  readonly places: number;
  readonly persons: number;
  readonly events: number;
  readonly ties: number;
  readonly nameMentions: number;
  readonly doubts: number;
  readonly dictionary: number;
  /** Words offered with a `canon` that differs from the one already in the dictionary. */
  readonly dictionarySkipped: readonly DictionarySkip[];
  readonly attributes: number;
}

/** Birth range of a person who is `age` full years old in the document of `year`. */
export function birthRange(year: number, age: number): { from: number; to: number } {
  return { from: year - age - 1, to: year - age };
}

function lookup(map: ReadonlyMap<string, number>, key: string, what: string): number {
  const id = map.get(key);
  if (id === undefined) throw new Error(`unknown ${what} key «${key}»`);
  return id;
}

interface Continued {
  readonly eventId: number;
  readonly headId: number;
  readonly spouseId: number | undefined;
}

/** The household (confession event) of an earlier reading of `scan` with this key. */
function findHousehold(
  db: DatabaseSync,
  from: { readonly scan: string; readonly household: string },
): Continued {
  const event = selectRows(
    db,
    z.object({ id: z.number(), main_person_id: z.number() }),
    `select e.id, e.main_person_id from event e join scan s on s.id = e.scan_id
      where s.name = ? and e.key = ? and e.main_person_id is not null order by e.run_id desc limit 1`,
    [from.scan, from.household],
  )[0];
  if (event === undefined) {
    throw new Error(`no household «${from.household}» read on scan «${from.scan}» to continue`);
  }
  const spouse = selectRows(
    db,
    z.object({ person_id: z.number() }),
    "select person_id from tie where event_id = ? and other_id = ? and type = 'spouse' order by id limit 1",
    [event.id, event.main_person_id],
  )[0];
  return { eventId: event.id, headId: event.main_person_id, spouseId: spouse?.person_id };
}

function insert(db: DatabaseSync, sql: string, params: (string | number | null)[]): number {
  return Number(db.prepare(sql).run(...params).lastInsertRowid);
}

/**
 * Validates `input` and writes it as the reading of run `runId`. Nothing is written when the
 * input is invalid or refers to something that does not exist.
 */
export function ingestReading(db: DatabaseSync, runId: number, input: unknown): IngestResult {
  const reading: Reading = readingSchema.parse(input);
  return inTransaction(db, () => writeReading(db, runId, reading));
}

function writeReading(db: DatabaseSync, runId: number, reading: Reading): IngestResult {
  const scan = selectRows(db, z.object({ id: z.number() }), "select id from scan where name = ?", [
    reading.scan,
  ])[0];
  if (scan === undefined) throw new Error(`unknown scan «${reading.scan}»`);
  if (
    selectRows(db, z.object({ id: z.number() }), "select id from run where id = ?", [runId])
      .length === 0
  ) {
    throw new Error(`unknown run ${String(runId)}`);
  }
  const scanId = scan.id;
  if (
    reading.source !== undefined &&
    selectRows(db, z.object({ id: z.number() }), "select id from source where id = ?", [
      reading.source,
    ]).length === 0
  ) {
    throw new Error(`unknown source ${String(reading.source)}: add it to the bank first`);
  }
  if (reading.source !== undefined) {
    db.prepare("update scan set source_id = ? where id = ? and source_id is null").run(
      reading.source,
      scanId,
    );
  }

  const boxId = (box: Box | undefined): number | null =>
    box === undefined
      ? null
      : insert(db, "insert into box (scan_id, x, y, w, h, origin) values (?, ?, ?, ?, ?, ?)", [
          scanId,
          box.x,
          box.y,
          box.w,
          box.h,
          box.origin,
        ]);

  const counts = {
    lines: 0,
    places: 0,
    persons: 0,
    events: 0,
    ties: 0,
    nameMentions: 0,
    doubts: 0,
    dictionary: 0,
    attributes: 0,
  };
  type Owner = "person_id" | "event_id" | "tie_id" | "place_id" | "on_scan";
  const addAttributes = (
    owner: Owner,
    ownerId: number | undefined,
    attributes: readonly { type: string; value: string; box?: Box | undefined }[],
    fallbackBox: number | null,
  ): void => {
    for (const attribute of attributes) {
      insert(
        db,
        `insert into attribute (run_id, scan_id, box_id, type, ${owner}, value) values (?, ?, ?, ?, ?, ?)`,
        [
          runId,
          scanId,
          boxId(attribute.box) ?? fallbackBox,
          attribute.type,
          ownerId ?? 1,
          attribute.value,
        ],
      );
      counts.attributes += 1;
    }
  };
  addAttributes("on_scan", undefined, reading.scan_attributes, null);

  const lineIds = new Map<string, number>();
  for (const line of reading.lines) {
    if (lineIds.has(line.key)) throw new Error(`duplicate line key «${line.key}»`);
    lineIds.set(
      line.key,
      insert(db, "insert into text_line (run_id, scan_id, box_id, text) values (?, ?, ?, ?)", [
        runId,
        scanId,
        boxId(line.box),
        line.text,
      ]),
    );
    counts.lines += 1;
  }
  const lineOf = (key: string | undefined): number | null =>
    key === undefined ? null : lookup(lineIds, key, "line");

  const placeIds = new Map<string, number>();
  for (const place of reading.places) {
    if (placeIds.has(place.key)) throw new Error(`duplicate place key «${place.key}»`);
    placeIds.set(
      place.key,
      insert(
        db,
        "insert into place (run_id, scan_id, box_id, line_id, name, type) values (?, ?, ?, ?, ?, ?)",
        [runId, scanId, boxId(place.box), lineOf(place.line), place.name, place.type ?? null],
      ),
    );
    counts.places += 1;
  }

  const personIds = new Map<string, number>();
  const personBoxes = new Map<string, number | null>();
  for (const household of reading.households) {
    const heads = household.members.filter((member) => member.head);
    const continued =
      household.continues === undefined ? undefined : findHousehold(db, household.continues);
    if (continued === undefined ? heads.length !== 1 : heads.length !== 0) {
      throw new Error(
        continued === undefined
          ? `household «${household.key}» must have exactly one head, has ${String(heads.length)}`
          : `household «${household.key}» continues another one and must have no head`,
      );
    }
    const householdBox = boxId(household.box);
    const householdLine = lineOf(household.line);
    const memberIds = new Map<string, number>();
    for (const member of household.members) {
      if (personIds.has(member.key)) throw new Error(`duplicate person key «${member.key}»`);
      const birth =
        typeof member.age === "number" ? birthRange(reading.year, member.age) : undefined;
      const memberBox = boxId(member.box) ?? householdBox;
      const memberLine = lineOf(member.line) ?? householdLine;
      const id = insert(
        db,
        `insert into person (run_id, scan_id, box_id, line_id, gender, given, patronymic, surname,
                             age, birth_from, birth_to, birth_qual)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          scanId,
          memberBox,
          memberLine,
          member.gender ?? null,
          member.given ?? null,
          member.patronymic ?? null,
          member.surname ?? null,
          member.age === undefined ? null : String(member.age),
          birth?.from ?? null,
          birth?.to ?? null,
          birth === undefined ? null : "calculated",
        ],
      );
      addAttributes("person_id", id, member.attributes, memberBox);
      personIds.set(member.key, id);
      personBoxes.set(member.key, memberBox);
      memberIds.set(member.key, id);
      counts.persons += 1;
      for (const [kind, text, partBox] of [
        ["given", member.given, member.given_box],
        ["patronymic", member.patronymic, member.patronymic_box],
        ["surname", member.surname, member.surname_box],
      ] as const) {
        if (text === undefined) continue;
        insert(
          db,
          `insert into name_mention (run_id, scan_id, box_id, line_id, person_id, kind, text)
           values (?, ?, ?, ?, ?, ?, ?)`,
          [runId, scanId, boxId(partBox) ?? memberBox, memberLine, id, kind, text],
        );
        counts.nameMentions += 1;
      }
    }
    const head = heads[0];
    let eventId: number;
    if (continued !== undefined) {
      eventId = continued.eventId;
    } else {
      if (head === undefined) throw new Error("unreachable: household without head");
      eventId = insert(
        db,
        `insert into event (run_id, scan_id, box_id, line_id, type, main_person_id, year, place_id,
                            number, key, source_id)
         values (?, ?, ?, ?, 'confession', ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          scanId,
          householdBox,
          householdLine,
          lookup(memberIds, head.key, "person"),
          reading.year,
          household.place === undefined ? null : lookup(placeIds, household.place, "place"),
          household.number ?? null,
          household.key,
          reading.source ?? null,
        ],
      );
      counts.events += 1;
    }
    for (const id of memberIds.values()) {
      db.prepare("update person set event_id = ? where id = ?").run(eventId, id);
    }
    addAttributes("event_id", eventId, household.attributes, householdBox);
    const tieEnd = (ref: string): number => {
      if (ref === "@head" || ref === "@spouse") {
        if (continued === undefined) throw new Error(`«${ref}» is only for a continued household`);
        const id = ref === "@head" ? continued.headId : continued.spouseId;
        if (id === undefined) throw new Error(`the continued household has no ${ref.slice(1)}`);
        return id;
      }
      return lookup(memberIds, ref, "person");
    };
    for (const tie of household.ties) {
      insert(
        db,
        `insert into tie (run_id, scan_id, box_id, line_id, person_id, other_id, type, relation, up,
                          down, event_id)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          scanId,
          boxId(tie.box) ?? householdBox,
          lineOf(tie.line) ?? householdLine,
          tieEnd(tie.person),
          tieEnd(tie.other),
          tie.type,
          tie.relation ?? null,
          tie.up ?? null,
          tie.down ?? null,
          eventId,
        ],
      );
      counts.ties += 1;
    }
  }

  const membersByKey = new Map(
    reading.households.flatMap((household) =>
      household.members.map((member) => [member.key, member] as const),
    ),
  );
  for (const doubt of reading.doubts) {
    if (
      doubt.person !== undefined &&
      (doubt.element === "surname" || doubt.element === "given" || doubt.element === "patronymic")
    ) {
      const member = membersByKey.get(doubt.person);
      if (member?.[doubt.element] === undefined) {
        throw new Error(
          `doubt about the ${doubt.element} of «${doubt.person}», but the person has no ${doubt.element}: put the most plausible full variant there`,
        );
      }
    }
    insert(
      db,
      `insert into doubt (run_id, scan_id, box_id, element, person_id, place_id, read_text, variants,
                          unreadable, note)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        scanId,
        boxId(doubt.box) ??
          (doubt.person === undefined ? null : (personBoxes.get(doubt.person) ?? null)),
        doubt.element,
        doubt.person === undefined ? null : lookup(personIds, doubt.person, "person"),
        doubt.place === undefined ? null : lookup(placeIds, doubt.place, "place"),
        doubt.read ?? null,
        doubt.variants ?? null,
        doubt.unreadable ? 1 : 0,
        doubt.note ?? null,
      ],
    );
    counts.doubts += 1;
  }

  // The dictionary belongs to the case and every run adds to it: a new word is added, a word that
  // is there stays as it is, and one offered with another `canon` is named in the result.
  const dictionarySkipped: DictionarySkip[] = [];
  for (const entry of reading.dictionary) {
    const existing = selectRows(
      db,
      z.object({ canon: z.string().nullable() }),
      "select canon from dict_entry where kind = ? and word = ?",
      [entry.kind, entry.word],
    )[0];
    if (existing === undefined) {
      db.prepare("insert into dict_entry (kind, word, canon, note) values (?, ?, ?, ?)").run(
        entry.kind,
        entry.word,
        entry.canon ?? null,
        entry.note ?? null,
      );
      counts.dictionary += 1;
    } else if (entry.canon !== undefined && entry.canon !== existing.canon) {
      dictionarySkipped.push({
        kind: entry.kind,
        word: entry.word,
        canon: existing.canon,
        proposed: entry.canon,
      });
    }
  }

  return { ...counts, dictionarySkipped };
}
