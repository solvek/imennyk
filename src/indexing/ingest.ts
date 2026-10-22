// Writes the reading of one scan into the case database, in one transaction.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { inTransaction, selectRows } from "./db.ts";
import { type Box, type Reading, readingSchema } from "./reading.ts";

export interface IngestResult {
  readonly lines: number;
  readonly places: number;
  readonly persons: number;
  readonly events: number;
  readonly ties: number;
  readonly nameMentions: number;
  readonly doubts: number;
  readonly dictionary: number;
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
  };

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
  for (const household of reading.households) {
    const heads = household.members.filter((member) => member.head);
    if (heads.length !== 1) {
      throw new Error(
        `household «${household.key}» must have exactly one head, has ${String(heads.length)}`,
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
                             age, birth_from, birth_to, birth_qual, note)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          member.note ?? null,
        ],
      );
      personIds.set(member.key, id);
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
    if (head === undefined) throw new Error("unreachable: household without head");
    const eventId = insert(
      db,
      `insert into event (run_id, scan_id, box_id, line_id, type, main_person_id, year, place_id,
                          number, note)
       values (?, ?, ?, ?, 'confession', ?, ?, ?, ?, ?)`,
      [
        runId,
        scanId,
        householdBox,
        householdLine,
        lookup(memberIds, head.key, "person"),
        reading.year,
        household.place === undefined ? null : lookup(placeIds, household.place, "place"),
        household.number ?? null,
        household.note ?? null,
      ],
    );
    counts.events += 1;
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
          lookup(memberIds, tie.person, "person"),
          lookup(memberIds, tie.other, "person"),
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

  for (const doubt of reading.doubts) {
    insert(
      db,
      `insert into doubt (run_id, scan_id, box_id, element, person_id, place_id, read_text, variants,
                          unreadable, note)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        scanId,
        boxId(doubt.box),
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

  for (const entry of reading.dictionary) {
    const changes = db
      .prepare("insert or ignore into dict_entry (kind, word, canon, note) values (?, ?, ?, ?)")
      .run(entry.kind, entry.word, entry.canon ?? null, entry.note ?? null).changes;
    counts.dictionary += Number(changes);
  }

  return counts;
}
