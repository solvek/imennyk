// Review of a case by a human: doubts and places of the sample are one kind of item with one set
// of states; only ties (doubts) and the error rate (sample) are specific to one set.
import { readdirSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { inTransaction, selectRows } from "./db.ts";
import { DOUBT_STATUSES, TIE_TYPES } from "./enums.ts";
import { namePart } from "./reading.ts";
import { readRunErrorRate, writeRunErrorRate, type RunErrorRate } from "./run.ts";

export type ReviewSet = "doubt" | "sample";

/** Address of one item: `doubt.id` or `sample.rank`. */
export interface ItemRef {
  readonly set: ReviewSet;
  readonly id: number;
}

export type ReviewStatus = (typeof DOUBT_STATUSES)[number];
export type ReviewTone = "ok" | "error";

const NAME_COLUMNS = ["given", "patronymic", "surname"] as const;
type NameColumn = (typeof NAME_COLUMNS)[number];

function isNameColumn(value: string | null): value is NameColumn {
  return NAME_COLUMNS.some((column) => column === value);
}

/** Green for a correct item, red for a wrong one, nothing while it is open. */
export function reviewTone(status: string): ReviewTone | null {
  if (status === "confirmed") return "ok";
  if (status === "open") return null;
  return "error";
}

/** Names of the sub-folders of `root`: one per case; nothing inside them is read. */
export function listCases(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
}

export interface TieInfo {
  readonly id: number;
  readonly otherId: number;
  readonly otherName: string;
  /** True when the person of the item is the `person` of the tie (reading direction). */
  readonly outgoing: boolean;
  readonly type: string;
  readonly relation: string | null;
  readonly up: number | null;
  readonly down: number | null;
}

export interface ReviewItem {
  readonly set: ReviewSet;
  readonly id: number;
  readonly scan: string;
  readonly url: string;
  /** File of the full scan in `raw/`. */
  readonly scanFile: string;
  readonly scanWidth: number;
  readonly scanHeight: number;
  /** The place on the scan, or null when the item has no box. */
  readonly box: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  } | null;
  readonly personId: number | null;
  readonly element: string;
  /** What the agent read (for the sample, the snapshot once the place has been reviewed). */
  readonly readText: string | null;
  readonly variants: string | null;
  readonly agentNote: string | null;
  readonly status: ReviewStatus;
  readonly note: string | null;
  /** The name part now in the database, when the item can be fixed by typing a value. */
  readonly currentValue: string | null;
  readonly editable: boolean;
  /** Ties of the person in the run, for a doubt about a tie. */
  readonly ties: readonly TieInfo[] | undefined;
}

export interface ItemFilter {
  readonly element?: string;
  readonly status?: string;
}

const itemRow = z.object({
  id: z.number(),
  scan: z.string(),
  url: z.string(),
  width: z.number(),
  height: z.number(),
  box_x: z.number().nullable(),
  box_y: z.number().nullable(),
  box_w: z.number().nullable(),
  box_h: z.number().nullable(),
  person_id: z.number().nullable(),
  run_id: z.number(),
  element: z.string(),
  read_text: z.string().nullable(),
  variants: z.string().nullable(),
  agent_note: z.string().nullable(),
  status: z.string(),
  note: z.string().nullable(),
  current_value: z.string().nullable(),
});

const DOUBT_SQL = `
  select d.id, s.name as scan, s.url, s.width, s.height, b.x as box_x, b.y as box_y, b.w as box_w, b.h as box_h,
         d.person_id, d.run_id, d.element, d.read_text, d.variants, d.note as agent_note,
         d.status, d.resolution as note,
         case d.element when 'given' then p.given when 'patronymic' then p.patronymic
                        when 'surname' then p.surname end as current_value
    from doubt d
    join scan s on s.id = d.scan_id
    left join box b on b.id = d.box_id
    left join person p on p.id = d.person_id`;

const SAMPLE_SQL = `
  select sm.rank as id, s.name as scan, s.url, s.width, s.height, b.x as box_x, b.y as box_y, b.w as box_w, b.h as box_h,
         m.person_id, m.run_id, 'surname' as element, coalesce(sm.read_text, m.text) as read_text,
         null as variants, null as agent_note, sm.status, sm.note, m.text as current_value
    from sample sm
    join name_mention m on m.id = sm.name_mention_id
    join scan s on s.id = m.scan_id
    left join box b on b.id = m.box_id`;

function itemSql(set: ReviewSet): string {
  return set === "doubt" ? DOUBT_SQL : SAMPLE_SQL;
}

const tieRow = z.object({
  id: z.number(),
  person_id: z.number(),
  other_id: z.number(),
  type: z.string(),
  relation: z.string().nullable(),
  up: z.number().nullable(),
  down: z.number().nullable(),
  given: z.string().nullable(),
  patronymic: z.string().nullable(),
  surname: z.string().nullable(),
});

/** «Given Patronymic Surname» of a person, or the id when nothing is read. */
function displayName(
  id: number,
  parts: { given: string | null; patronymic: string | null; surname: string | null },
): string {
  const name = [parts.given, parts.patronymic, parts.surname]
    .filter((part): part is string => part !== null)
    .join(" ");
  return name === "" ? `#${String(id)}` : name;
}

function tiesOf(db: DatabaseSync, personId: number, runId: number): TieInfo[] {
  return selectRows(
    db,
    tieRow,
    `select t.id, t.person_id, t.other_id, t.type, t.relation, t.up, t.down,
            o.given, o.patronymic, o.surname
       from tie t
       join person o on o.id = case when t.person_id = ?1 then t.other_id else t.person_id end
      where t.run_id = ?2 and (t.person_id = ?1 or t.other_id = ?1)
      order by t.id`,
    [personId, runId],
  ).map((row) => {
    const outgoing = row.person_id === personId;
    const otherId = outgoing ? row.other_id : row.person_id;
    return {
      id: row.id,
      otherId,
      otherName: displayName(otherId, row),
      outgoing,
      type: row.type,
      relation: row.relation,
      up: row.up,
      down: row.down,
    };
  });
}

function toStatus(value: string): ReviewStatus {
  const status = DOUBT_STATUSES.find((candidate) => candidate === value);
  if (status === undefined) throw new Error(`unknown review status «${value}»`);
  return status;
}

function toItem(db: DatabaseSync, set: ReviewSet, row: z.infer<typeof itemRow>): ReviewItem {
  const editable = row.person_id !== null && (set === "sample" || isNameColumn(row.element));
  return {
    set,
    id: row.id,
    scan: row.scan,
    url: row.url,
    scanFile: `${row.scan}.jpg`,
    scanWidth: row.width,
    scanHeight: row.height,
    box:
      row.box_x === null || row.box_y === null || row.box_w === null || row.box_h === null
        ? null
        : { x: row.box_x, y: row.box_y, w: row.box_w, h: row.box_h },
    personId: row.person_id,
    element: row.element,
    readText: row.read_text,
    variants: row.variants,
    agentNote: row.agent_note,
    status: toStatus(row.status),
    note: row.note,
    currentValue: row.current_value,
    editable,
    ties:
      set === "doubt" && row.element === "tie" && row.person_id !== null
        ? tiesOf(db, row.person_id, row.run_id)
        : undefined,
  };
}

/** Items of a set, open ones first; `filter` narrows by element and by state. */
export function listItems(db: DatabaseSync, set: ReviewSet, filter: ItemFilter = {}): ReviewItem[] {
  const idColumn = set === "doubt" ? "d.id" : "sm.rank";
  const statusColumn = set === "doubt" ? "d.status" : "sm.status";
  const elementColumn = set === "doubt" ? "d.element" : "'surname'";
  const params: string[] = [];
  const where: string[] = [];
  if (filter.element !== undefined) {
    where.push(`${elementColumn} = ?`);
    params.push(filter.element);
  }
  if (filter.status !== undefined) {
    where.push(`${statusColumn} = ?`);
    params.push(filter.status);
  }
  const sql = `${itemSql(set)}
    ${where.length > 0 ? `where ${where.join(" and ")}` : ""}
    order by (${statusColumn} <> 'open'), ${idColumn}`;
  return selectRows(db, itemRow, sql, params).map((row) => toItem(db, set, row));
}

function getItem(db: DatabaseSync, ref: ItemRef): { item: ReviewItem; runId: number } {
  const idColumn = ref.set === "doubt" ? "d.id" : "sm.rank";
  const row = selectRows(db, itemRow, `${itemSql(ref.set)} where ${idColumn} = ?`, [ref.id])[0];
  if (row === undefined) throw new Error(`no ${ref.set} ${String(ref.id)}`);
  return { item: toItem(db, ref.set, row), runId: row.run_id };
}

/** One item by its address, or undefined when there is none. */
export function findItem(db: DatabaseSync, ref: ItemRef): ReviewItem | undefined {
  try {
    return getItem(db, ref).item;
  } catch {
    return undefined;
  }
}

export interface Progress {
  readonly total: number;
  /** Items that are not open. */
  readonly reviewed: number;
  readonly byElement: readonly { element: string; total: number; reviewed: number }[];
}

const progressRow = z.object({ element: z.string(), total: z.number(), reviewed: z.number() });

export function progress(db: DatabaseSync, set: ReviewSet): Progress {
  const sql =
    set === "doubt"
      ? `select element, count(*) as total, coalesce(sum(status <> 'open'), 0) as reviewed
           from doubt group by element order by element`
      : `select 'surname' as element, count(*) as total, coalesce(sum(status <> 'open'), 0) as reviewed
           from sample having count(*) > 0`;
  const byElement = selectRows(db, progressRow, sql);
  return {
    total: byElement.reduce((sum, row) => sum + row.total, 0),
    reviewed: byElement.reduce((sum, row) => sum + row.reviewed, 0),
    byElement,
  };
}

function cleanNote(note: string | undefined): string | null {
  const trimmed = note?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** Writes state and note; the snapshot of the reading of a sample place is taken first. */
function writeStatus(
  db: DatabaseSync,
  ref: ItemRef,
  status: ReviewStatus,
  note: string | null,
): void {
  if (ref.set === "doubt") {
    db.prepare("update doubt set status = ?, resolution = ? where id = ?").run(
      status,
      note,
      ref.id,
    );
    return;
  }
  db.prepare(
    `update sample set read_text = coalesce(read_text, (select text from name_mention where id = name_mention_id))
      where rank = ?`,
  ).run(ref.id);
  db.prepare("update sample set status = ?, note = ? where rank = ?").run(status, note, ref.id);
}

/** Marks an item as correct, or as unreadable / unknown, leaving the values as they are. */
export function setStatus(
  db: DatabaseSync,
  ref: ItemRef,
  status: "confirmed" | "unknown",
  note?: string,
): void {
  inTransaction(db, () => {
    getItem(db, ref);
    writeStatus(db, ref, status, cleanNote(note));
  });
}

/** Opens a reviewed item again; the state and the note go, values changed by a fix stay. */
export function reopen(db: DatabaseSync, ref: ItemRef): void {
  inTransaction(db, () => {
    getItem(db, ref);
    if (ref.set === "doubt") {
      db.prepare("update doubt set status = 'open', resolution = null where id = ?").run(ref.id);
    } else {
      db.prepare("update sample set status = 'open', note = null where rank = ?").run(ref.id);
    }
  });
}

/**
 * Sets the name part of an item: the person and every mention of that part in the same run change
 * together, and the item becomes «fixed». A value the reading would refuse changes nothing.
 */
export function fixName(db: DatabaseSync, ref: ItemRef, value: string, note?: string): void {
  const parsed = namePart.safeParse(value.trim());
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "));
  }
  const { item, runId } = getItem(db, ref);
  const column = ref.set === "sample" ? "surname" : item.element;
  if (!item.editable || item.personId === null || !isNameColumn(column)) {
    throw new Error("only the given name, patronymic and surname can be fixed by a value");
  }
  inTransaction(db, () => {
    // The snapshot of a sample place has to be taken before the mention changes.
    if (ref.set === "sample") writeStatus(db, ref, item.status, item.note);
    db.prepare(`update person set ${column} = ? where id = ?`).run(parsed.data, item.personId);
    db.prepare(
      "update name_mention set text = ? where person_id = ? and kind = ? and run_id = ?",
    ).run(parsed.data, item.personId, column, runId);
    writeStatus(db, ref, "fixed", cleanNote(note));
  });
}

// ---- Ties (doubts about a tie)

const personRow = z.object({
  id: z.number(),
  scan_id: z.number(),
  given: z.string().nullable(),
  patronymic: z.string().nullable(),
  surname: z.string().nullable(),
});

export interface TieCandidate {
  readonly personId: number;
  readonly name: string;
  readonly isHead: boolean;
  /** The household event of this person when they are its head. */
  readonly eventId: number | null;
}

export interface TieCandidates {
  readonly candidates: readonly TieCandidate[];
  /** The head of the nearest household before the person of the doubt. */
  readonly defaultId: number | null;
}

interface TieDoubt {
  readonly personId: number;
  readonly runId: number;
  readonly scanId: number;
  readonly boxId: number | null;
}

const doubtRow = z.object({
  person_id: z.number().nullable(),
  run_id: z.number(),
  scan_id: z.number(),
  box_id: z.number().nullable(),
  element: z.string(),
});

function tieDoubt(db: DatabaseSync, doubtId: number): TieDoubt {
  const row = selectRows(db, doubtRow, "select * from doubt where id = ?", [doubtId])[0];
  if (row === undefined) throw new Error(`no doubt ${String(doubtId)}`);
  if (row.element !== "tie" || row.person_id === null) {
    throw new Error("only a doubt about a tie of a person can have a tie added or deleted");
  }
  return { personId: row.person_id, runId: row.run_id, scanId: row.scan_id, boxId: row.box_id };
}

/** People of the run on the scan of the doubt and on the scan before it (ids follow scan order). */
export function tieCandidates(db: DatabaseSync, doubtId: number): TieCandidates {
  const doubt = tieDoubt(db, doubtId);
  const previous = selectRows(
    db,
    z.object({ id: z.number() }),
    "select id from scan where id < ? order by id desc limit 1",
    [doubt.scanId],
  )[0]?.id;
  const people = selectRows(
    db,
    personRow,
    `select id, scan_id, given, patronymic, surname from person
      where run_id = ? and id <> ? and scan_id in (?, ?) order by id`,
    [doubt.runId, doubt.personId, doubt.scanId, previous ?? doubt.scanId],
  );
  const heads = new Map(
    selectRows(
      db,
      z.object({ id: z.number(), main_person_id: z.number() }),
      `select min(id) as id, main_person_id from event
        where run_id = ? and type = 'confession' and main_person_id is not null
        group by main_person_id`,
      [doubt.runId],
    ).map((row) => [row.main_person_id, row.id]),
  );
  const candidates = people.map((person) => ({
    personId: person.id,
    name: displayName(person.id, person),
    isHead: heads.has(person.id),
    eventId: heads.get(person.id) ?? null,
  }));
  const defaultId =
    candidates.filter((candidate) => candidate.isHead && candidate.personId < doubt.personId).at(-1)
      ?.personId ?? null;
  return { candidates, defaultId };
}

export interface NewTie {
  readonly otherId: number;
  readonly type: string;
  readonly relation?: string | undefined;
  readonly up?: number | undefined;
  readonly down?: number | undefined;
}

/** Adds a tie from the person of the doubt (reading direction) and closes the doubt. */
export function addTieForDoubt(
  db: DatabaseSync,
  doubtId: number,
  tie: NewTie,
  note?: string,
): void {
  const doubt = tieDoubt(db, doubtId);
  if (tie.otherId === doubt.personId) throw new Error("a person cannot be tied to themselves");
  if (!TIE_TYPES.some((type) => type === tie.type)) {
    throw new Error(`unknown tie type «${tie.type}»`);
  }
  const other = tieCandidates(db, doubtId).candidates.find(
    (candidate) => candidate.personId === tie.otherId,
  );
  if (other === undefined) {
    throw new Error("the other person has to be from this scan or the one before it");
  }
  inTransaction(db, () => {
    db.prepare(
      `insert into tie (run_id, scan_id, box_id, person_id, other_id, type, relation, up, down, event_id)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      doubt.runId,
      doubt.scanId,
      doubt.boxId,
      doubt.personId,
      tie.otherId,
      tie.type,
      tie.relation ?? null,
      tie.up ?? null,
      tie.down ?? null,
      other.eventId,
    );
    writeStatus(db, { set: "doubt", id: doubtId }, "tie_added", cleanNote(note));
  });
}

/** Deletes a tie of the person of the doubt (with its attributes) and closes the doubt. */
export function deleteTieForDoubt(
  db: DatabaseSync,
  doubtId: number,
  tieId: number,
  note?: string,
): void {
  const doubt = tieDoubt(db, doubtId);
  const owned = selectRows(
    db,
    z.object({ id: z.number() }),
    "select id from tie where id = ?1 and run_id = ?2 and (person_id = ?3 or other_id = ?3)",
    [tieId, doubt.runId, doubt.personId],
  );
  if (owned.length === 0) throw new Error("this tie does not belong to the person of the doubt");
  inTransaction(db, () => {
    db.prepare("delete from attribute where tie_id = ?").run(tieId);
    db.prepare("delete from tie where id = ?").run(tieId);
    writeStatus(db, { set: "doubt", id: doubtId }, "tie_deleted", cleanNote(note));
  });
}

// ---- Error rate of the sample

export interface ErrorRate extends RunErrorRate {
  readonly runId: number;
}

/** Share of wrong places (fixed + unreadable) in the whole sample, to 0.1 %. */
export function errorRate(db: DatabaseSync): ErrorRate {
  const rows = selectRows(
    db,
    z.object({ run_id: z.number(), status: z.string() }),
    `select m.run_id, sm.status from sample sm join name_mention m on m.id = sm.name_mention_id`,
  );
  if (rows.length === 0) throw new Error("the sample is not built yet");
  const runs = new Set(rows.map((row) => row.run_id));
  const [runId] = [...runs];
  if (runs.size !== 1 || runId === undefined) {
    throw new Error("the sample belongs to several runs; the rate is counted for one run");
  }
  const errors = rows.filter((row) => reviewTone(row.status) === "error").length;
  return {
    runId,
    size: rows.length,
    errors,
    percent: Math.round((errors / rows.length) * 1000) / 10,
  };
}

/**
 * Makes every open place of the sample «correct», counts the rate and writes it into the
 * metafile of the run in `dir`. The states are saved before the file is written, so a failed
 * write is repeated by pressing the button again.
 */
export function recordErrorRate(db: DatabaseSync, dir: string): ErrorRate {
  const rate = inTransaction(db, () => {
    for (const item of listItems(db, "sample", { status: "open" })) {
      writeStatus(db, { set: "sample", id: item.id }, "confirmed", null);
    }
    return errorRate(db);
  });
  writeRunErrorRate(db, rate.runId, dir, rate);
  return rate;
}

/** The rate last written into the metafile of the run of the sample, if any. */
export function recordedErrorRate(db: DatabaseSync, dir: string): RunErrorRate | null {
  let rate: ErrorRate;
  try {
    rate = errorRate(db);
  } catch {
    return null;
  }
  return readRunErrorRate(db, rate.runId, dir);
}
