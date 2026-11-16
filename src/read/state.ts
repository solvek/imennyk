// What the next page needs from the previous one. It is a few lines of text, kept beside the bank,
// and it is the only memory between scans: the images of the previous page are not sent again.

import { z } from "zod";
import type { Reading } from "../indexing/reading.ts";
import { isRecord } from "./json.ts";

export interface ReadState {
  readonly year: number | null;
  readonly lastDate: string | null;
  readonly lastNumber: string | null;
  readonly officiant: string | null;
  readonly place: string | null;
  /** A record that started on the previous page and was not finished there. */
  readonly pending: string | null;
}

export const EMPTY_STATE: ReadState = {
  year: null,
  lastDate: null,
  lastNumber: null,
  officiant: null,
  place: null,
  pending: null,
};

/** Fields the model may send back with a page. An absent field changes nothing. */
export interface CarryUpdate {
  readonly year?: number | null;
  readonly lastDate?: string | null;
  readonly lastNumber?: string | null;
  readonly officiant?: string | null;
  readonly place?: string | null;
  readonly pending?: string | null;
}

const carrySchema = z.object({
  year: z.int().nullable().optional(),
  lastDate: z.string().nullable().optional(),
  lastNumber: z.string().nullable().optional(),
  officiant: z.string().nullable().optional(),
  place: z.string().nullable().optional(),
  pending: z.string().nullable().optional(),
});

const stateFileSchema = z.object({
  runId: z.int().positive(),
  state: z.object({
    year: z.int().nullable(),
    lastDate: z.string().nullable(),
    lastNumber: z.string().nullable(),
    officiant: z.string().nullable(),
    place: z.string().nullable(),
    pending: z.string().nullable(),
  }),
});

export interface StateFile {
  readonly runId: number;
  readonly state: ReadState;
}

/** The state file of a case: which run it belongs to, and the state itself. */
export function parseStateFile(value: unknown): StateFile {
  const file = stateFileSchema.parse(value);
  return { runId: file.runId, state: file.state };
}

/** The text of the state file. */
export function formatStateFile(file: StateFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * The state after a page. A page of records replaces the date, the number, the place and the
 * priest with its own last record and clears a pending continuation, unless the model says the
 * page itself ends in the middle of a record. A page with no records (a title, a blank) keeps the
 * previous state and takes the year of the page.
 */
export function nextState(previous: ReadState, reading: Reading, carry: CarryUpdate): ReadState {
  const base: ReadState =
    reading.events.length > 0
      ? { ...stateFromReading(reading), pending: null }
      : { ...previous, year: reading.year };
  return {
    year: carry.year ?? base.year,
    lastDate: overlay(base.lastDate, carry.lastDate),
    lastNumber: overlay(base.lastNumber, carry.lastNumber),
    officiant: overlay(base.officiant, carry.officiant),
    place: overlay(base.place, carry.place),
    pending: carry.pending !== undefined ? carry.pending : base.pending,
  };
}

function overlay(base: string | null, update: string | null | undefined): string | null {
  if (update === undefined || update === null) return base;
  return update;
}

function stateFromReading(reading: Reading): ReadState {
  const event = reading.events.at(-1);
  const placeKey = event?.place;
  const place = reading.places.find((item) => item.key === placeKey);
  return {
    year: reading.year,
    lastDate: event?.date ?? null,
    lastNumber: event?.number ?? null,
    officiant: event === undefined ? null : officiantOf(event),
    place: place?.name ?? null,
    pending: null,
  };
}

function officiantOf(event: Reading["events"][number]): string | null {
  const tie = event.ties.find((item) => item.type === "officiant");
  if (tie === undefined) return null;
  const person = event.members.find((member) => member.key === tie.person);
  if (person === undefined) return null;
  const name = [person.given, person.surname].filter((part) => part !== undefined).join(" ");
  return name === "" ? null : name;
}

/** The carry object of a model reply; anything it did not send stays unset. */
export function parseCarry(value: unknown): CarryUpdate {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new Error("carry is not an object");
  const parsed = carrySchema.parse(value);
  return {
    ...(parsed.year !== undefined ? { year: parsed.year } : {}),
    ...(parsed.lastDate !== undefined ? { lastDate: parsed.lastDate } : {}),
    ...(parsed.lastNumber !== undefined ? { lastNumber: parsed.lastNumber } : {}),
    ...(parsed.officiant !== undefined ? { officiant: parsed.officiant } : {}),
    ...(parsed.place !== undefined ? { place: parsed.place } : {}),
    ...(parsed.pending !== undefined ? { pending: parsed.pending } : {}),
  };
}
