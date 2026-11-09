// Review of a case by a human: doubts and places of the sample are one kind of item with one set
// of states; only the error rate is specific to the sample.
import { readdirSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { inTransaction, selectRows } from "./db.ts";
import { REVIEW_STATUSES } from "./enums.ts";
import { namePart } from "./reading.ts";
import { readRunErrorRate, writeRunErrorRate, type RunErrorRate } from "./run.ts";

export type ReviewSet = "doubt" | "sample";

/** Address of one item: `doubt.id` or `sample.id`; both are unique in the whole database. */
export interface ItemRef {
  readonly set: ReviewSet;
  readonly id: number;
}

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
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

export interface ReviewItem {
  readonly set: ReviewSet;
  readonly id: number;
  /** Place in the sample of its run (1…), or null for a doubt. */
  readonly rank: number | null;
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
}

export interface ItemFilter {
  readonly element?: string;
  readonly status?: string;
}

const itemRow = z.object({
  id: z.number(),
  rank: z.number().nullable(),
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
  select d.id, null as rank, s.name as scan, s.url, s.width, s.height, b.x as box_x, b.y as box_y, b.w as box_w, b.h as box_h,
         d.person_id, d.run_id, d.element, d.read_text, d.variants, d.note as agent_note,
         d.status, d.resolution as note,
         case d.element when 'given' then p.given when 'patronymic' then p.patronymic
                        when 'surname' then p.surname end as current_value
    from doubt d
    join scan s on s.id = d.scan_id
    left join box b on b.id = d.box_id
    left join person p on p.id = d.person_id`;

const SAMPLE_SQL = `
  select sm.id, sm.rank, s.name as scan, s.url, s.width, s.height, b.x as box_x, b.y as box_y, b.w as box_w, b.h as box_h,
         m.person_id, m.run_id, 'surname' as element, coalesce(sm.read_text, m.text) as read_text,
         null as variants, null as agent_note, sm.status, sm.note, m.text as current_value
    from sample sm
    join name_mention m on m.id = sm.name_mention_id
    join scan s on s.id = m.scan_id
    left join box b on b.id = m.box_id`;

function itemSql(set: ReviewSet): string {
  return set === "doubt" ? DOUBT_SQL : SAMPLE_SQL;
}

function toStatus(value: string): ReviewStatus {
  const status = REVIEW_STATUSES.find((candidate) => candidate === value);
  if (status === undefined) throw new Error(`unknown review status «${value}»`);
  return status;
}

function toItem(set: ReviewSet, row: z.infer<typeof itemRow>): ReviewItem {
  const editable = row.person_id !== null && (set === "sample" || isNameColumn(row.element));
  return {
    set,
    id: row.id,
    rank: row.rank,
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
  };
}

/**
 * Items of a set that belong to run `runId`, open ones first; `filter` narrows by element and by
 * state. Doubts go in the order they were found, places of the sample in the order of their rank.
 */
export function listItems(
  db: DatabaseSync,
  set: ReviewSet,
  runId: number,
  filter: ItemFilter = {},
): ReviewItem[] {
  const orderColumn = set === "doubt" ? "d.id" : "sm.rank";
  const statusColumn = set === "doubt" ? "d.status" : "sm.status";
  const elementColumn = set === "doubt" ? "d.element" : "'surname'";
  const runColumn = set === "doubt" ? "d.run_id" : "sm.run_id";
  const params: (string | number)[] = [runId];
  const where: string[] = [`${runColumn} = ?`];
  if (filter.element !== undefined) {
    where.push(`${elementColumn} = ?`);
    params.push(filter.element);
  }
  if (filter.status !== undefined) {
    where.push(`${statusColumn} = ?`);
    params.push(filter.status);
  }
  const sql = `${itemSql(set)}
    where ${where.join(" and ")}
    order by (${statusColumn} <> 'open'), ${orderColumn}`;
  return selectRows(db, itemRow, sql, params).map((row) => toItem(set, row));
}

function getItem(db: DatabaseSync, ref: ItemRef): { item: ReviewItem; runId: number } {
  const idColumn = ref.set === "doubt" ? "d.id" : "sm.id";
  const row = selectRows(db, itemRow, `${itemSql(ref.set)} where ${idColumn} = ?`, [ref.id])[0];
  if (row === undefined) throw new Error(`no ${ref.set} ${String(ref.id)}`);
  return { item: toItem(ref.set, row), runId: row.run_id };
}

/** One item of run `runId` by its address, or undefined when there is none (or it is of another run). */
export function findItem(db: DatabaseSync, ref: ItemRef, runId: number): ReviewItem | undefined {
  try {
    const found = getItem(db, ref);
    return found.runId === runId ? found.item : undefined;
  } catch {
    return undefined;
  }
}

export interface RunSummary {
  readonly id: number;
  readonly model: string;
  readonly note: string | null;
  readonly startedAt: string;
}

const runSummaryRow = z.object({
  id: z.number(),
  model: z.string(),
  note: z.string().nullable(),
  started_at: z.string(),
});

/** Runs of the case, the oldest first. */
export function listRuns(db: DatabaseSync): RunSummary[] {
  return selectRows(
    db,
    runSummaryRow,
    "select id, model, note, started_at from run order by id",
  ).map((row) => ({ id: row.id, model: row.model, note: row.note, startedAt: row.started_at }));
}

export interface Progress {
  readonly total: number;
  /** Items that are not open. */
  readonly reviewed: number;
  readonly byElement: readonly { element: string; total: number; reviewed: number }[];
}

const progressRow = z.object({ element: z.string(), total: z.number(), reviewed: z.number() });

/** How much of a set of run `runId` has been reviewed. */
export function progress(db: DatabaseSync, set: ReviewSet, runId: number): Progress {
  const sql =
    set === "doubt"
      ? `select element, count(*) as total, coalesce(sum(status <> 'open'), 0) as reviewed
           from doubt where run_id = ? group by element order by element`
      : `select 'surname' as element, count(*) as total, coalesce(sum(status <> 'open'), 0) as reviewed
           from sample where run_id = ? having count(*) > 0`;
  const byElement = selectRows(db, progressRow, sql, [runId]);
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
      where id = ?`,
  ).run(ref.id);
  db.prepare("update sample set status = ?, note = ? where id = ?").run(status, note, ref.id);
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
      db.prepare("update sample set status = 'open', note = null where id = ?").run(ref.id);
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

// ---- Error rate of the sample

export interface ErrorRate extends RunErrorRate {
  readonly runId: number;
}

/** Share of wrong places (fixed + unreadable) in the sample of run `runId`, to 0.1 %. */
export function errorRate(db: DatabaseSync, runId: number): ErrorRate {
  const rows = selectRows(
    db,
    z.object({ status: z.string() }),
    "select status from sample where run_id = ?",
    [runId],
  );
  if (rows.length === 0) throw new Error("the sample is not built yet");
  const errors = rows.filter((row) => reviewTone(row.status) === "error").length;
  return {
    runId,
    size: rows.length,
    errors,
    percent: Math.round((errors / rows.length) * 1000) / 10,
  };
}

/**
 * Makes every open place of the sample of run `runId` «correct», counts the rate and writes it
 * into the run in the bank, all in one transaction. Other runs are not touched.
 */
export function recordErrorRate(db: DatabaseSync, runId: number): ErrorRate {
  return inTransaction(db, () => {
    for (const item of listItems(db, "sample", runId, { status: "open" })) {
      writeStatus(db, { set: "sample", id: item.id }, "confirmed", null);
    }
    const rate = errorRate(db, runId);
    writeRunErrorRate(db, rate.runId, rate);
    return rate;
  });
}

/** The rate last written for run `runId`, if its sample is built and there is one. */
export function recordedErrorRate(db: DatabaseSync, runId: number): RunErrorRate | null {
  try {
    errorRate(db, runId);
  } catch {
    return null;
  }
  return readRunErrorRate(db, runId);
}
