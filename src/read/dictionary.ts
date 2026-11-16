// The dictionary check is code, not another look at the page. A surname the model wrote that is
// one or two letters away from exactly one surname of the case is treated as a misreading of that
// surname: the field becomes the surname of the case, and the letters the model saw stay in a doubt.
// A surname that is already in the case, or that is like several of them, is left as read.

import type { CaseHints } from "../indexing/hints.ts";
import type { Reading } from "../indexing/reading.ts";

type Member = Reading["events"][number]["members"][number];
type Doubt = Reading["doubts"][number];

/**
 * How far a word may be from a surname of the case and still be the same word. Short words are
 * not corrected: two letters is a different name when the name has five.
 */
function maxDistance(length: number): number {
  if (length < 5) return 0;
  if (length < 8) return 1;
  return 2;
}

/** Letters only, so "Стадницька" and "стадницка" can be compared. Marks and apostrophes go. */
export function foldName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['’ʼ`\- ]/gu, "")
    .toLowerCase();
}

function distance(left: string, right: string, limit: number): number {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const next = [row];
    let best = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      const value = Math.min(
        (previous[column] ?? limit + 1) + 1,
        (next[column - 1] ?? limit + 1) + 1,
        (previous[column - 1] ?? limit + 1) + cost,
      );
      next.push(value);
      if (value < best) best = value;
    }
    if (best > limit) return limit + 1;
    previous = next;
  }
  return previous[right.length] ?? limit + 1;
}

/** The one surname of `surnames` that `word` is a misreading of, or none. */
export function nearestSurname(word: string, surnames: readonly string[]): string | undefined {
  const folded = foldName(word);
  const limit = maxDistance(folded.length);
  if (limit === 0) return undefined;
  const hits: string[] = [];
  for (const surname of surnames) {
    const other = foldName(surname);
    if (other === folded) return undefined;
    if (distance(folded, other, limit) <= limit) hits.push(surname);
  }
  const unique = [...new Set(hits.map((hit) => foldName(hit)))];
  if (unique.length !== 1) return undefined;
  return hits[0];
}

/**
 * Surnames of the records, corrected against `surnames` where the correction is unambiguous.
 * Households are not records of a register and are left alone.
 */
export function alignSurnames(reading: Reading, surnames: readonly string[]): Reading {
  if (surnames.length === 0) return reading;
  const doubts: Doubt[] = [...reading.doubts];
  const events = reading.events.map((event) => ({
    ...event,
    members: event.members.map((member) => alignMember(member, surnames, doubts)),
  }));
  return { ...reading, events, doubts };
}

function alignMember(member: Member, surnames: readonly string[], doubts: Doubt[]): Member {
  const surname = member.surname;
  if (surname === undefined) return member;
  const corrected = nearestSurname(surname, surnames);
  if (corrected === undefined || corrected === surname) return member;
  const already = doubts.some(
    (doubt) => doubt.element === "surname" && doubt.person === member.key,
  );
  if (!already) {
    doubts.push({
      element: "surname",
      person: member.key,
      read: surname,
      variants: corrected,
      unreadable: false,
      note: "близьке прізвище словника",
    });
  }
  return { ...member, surname: corrected };
}

/** Surnames already in the bank: the dictionary of the case and the surnames read so far. */
export function surnamesOf(hints: CaseHints): string[] {
  const found: string[] = [];
  for (const entry of hints.dictionary) {
    if (entry.kind !== "surname") continue;
    found.push(entry.word);
    if (entry.canon !== null) found.push(entry.canon);
  }
  for (const name of hints.names) {
    if (name.kind === "surname") found.push(name.text);
  }
  return [...new Set(found)];
}
