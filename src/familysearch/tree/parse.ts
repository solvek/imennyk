// FamilySearch replies → sanitized records. Pure functions, no network.
import { livingState, type LivingState } from "../living.ts";
import type { Details, Fact, Summary } from "./api.ts";
import type { TreeDate, TreeEvent, TreePerson, TreePlace } from "./model.ts";

const pad = (n: number): string => String(n).padStart(2, "0");
const year4 = (n: number): string => String(n).padStart(4, "0");

function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Reads a GEDCOM X formal date (`+1946-06-28`, `+1911-05`, `+1820`, `A+1770` for about) into
 * bounds. A day is exact; a month or a year is the whole month or year (`exact`, as the well
 * writes a year-only document date); `about` is the year ±2, as `ddb.doc_bounds` reads `ABT`.
 * Anything else (ranges, before, after, a month with `about`) gives null.
 */
export function readFormalDate(formal: string | null | undefined): TreeDate | null {
  if (formal === null || formal === undefined) return null;
  const m = /^(A)?\+(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(formal);
  if (m === null) return null;
  const year = Number(m[2]);
  const month = m[3] === undefined ? undefined : Number(m[3]);
  const day = m[4] === undefined ? undefined : Number(m[4]);
  if (month !== undefined && (month < 1 || month > 12)) return null;
  if (month !== undefined && day !== undefined && (day < 1 || day > lastDay(year, month))) {
    return null;
  }
  if (m[1] !== undefined) {
    if (month !== undefined) return null;
    return { from: `${year4(year - 2)}-01-01`, to: `${year4(year + 2)}-12-31`, qual: "about" };
  }
  const y = year4(year);
  if (month === undefined) return { from: `${y}-01-01`, to: `${y}-12-31`, qual: "exact" };
  if (day === undefined) {
    return {
      from: `${y}-${pad(month)}-01`,
      to: `${y}-${pad(month)}-${pad(lastDay(year, month))}`,
      qual: "exact",
    };
  }
  const exact = `${y}-${pad(month)}-${pad(day)}`;
  return { from: exact, to: exact, qual: "exact" };
}

/** A bare year written as text (`1820`) also reads, when the formal date is missing. */
function readDate(date: NonNullable<Fact["details"]["date"]>): TreeDate | null {
  const formal = readFormalDate(date.formalText);
  if (formal !== null) return formal;
  const text = (date.originalText ?? date.normalizedText ?? "").trim();
  return /^\d{4}$/.test(text) && date.modifier == null ? readFormalDate(`+${text}`) : null;
}

function readPlace(place: NonNullable<Fact["details"]["place"]>): TreePlace | null {
  const name = (place.originalText ?? place.normalizedText ?? "").trim();
  if (name === "") return null;
  const standard = place.normalizedText?.trim();
  return {
    id: place.id ?? null,
    name,
    standard: standard === undefined || standard === "" ? null : standard,
    latitude: place.geoCode?.latitude ?? null,
    longitude: place.geoCode?.longitude ?? null,
  };
}

/** A fact as an event; null when it says nothing (no date, no text, no place). */
export function readFact(fact: Fact | null | undefined): TreeEvent | null {
  if (fact === null || fact === undefined) return null;
  const { date, place } = fact.details;
  const parsed = date == null ? null : readDate(date);
  const text = date == null ? "" : (date.originalText ?? date.normalizedText ?? "").trim();
  const event: TreeEvent = {
    date: parsed,
    dateText: parsed === null && text !== "" ? text : null,
    place: place == null ? null : readPlace(place),
  };
  return event.date === null && event.dateText === null && event.place === null ? null : event;
}

/** Year of the first day of a date, for the living rule. */
export function yearOf(date: TreeDate | null): number | undefined {
  return date === null ? undefined : Number(date.from.slice(0, 4));
}

const PATRONYMIC = /(ович|евич|євич|йович|івна|ївна|ична|овна|евна|ічна)$/u;

/**
 * FamilySearch keeps «Іван Петрович» in the given part. A second word with a patronymic ending
 * is the patronymic; any other second word stays in the given name.
 */
export function splitGiven(given: string): { given: string; patronymic: string | null } {
  const words = given.trim().split(/\s+/u);
  const [first, second] = words;
  if (
    words.length === 2 &&
    first !== undefined &&
    second !== undefined &&
    PATRONYMIC.test(second.toLowerCase())
  ) {
    return { given: first, patronymic: second };
  }
  return { given: given.trim(), patronymic: null };
}

function orNull(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text === undefined || text === "" ? null : text;
}

/**
 * Whether the person is alive, from the details: the flag of FamilySearch, a recorded death
 * (a date or only the marker «Deceased»), the year of birth.
 */
export function livingOf(details: Details, referenceYear: number): LivingState {
  const birth = readFact(details.birth);
  return livingState(
    {
      flaggedLiving: details.living,
      deathRecorded: details.death != null,
      birthYear: yearOf(birth?.date ?? null),
    },
    referenceYear,
  );
}

function genderOf(value: string | null | undefined): TreePerson["gender"] {
  if (value === "MALE") return "male";
  if (value === "FEMALE") return "female";
  return null;
}

/** Ids of the persons of a family, except the person themselves; living ones included. */
function otherIds(
  parent1: Summary | null | undefined,
  parent2: Summary | null | undefined,
  self: string,
): string[] {
  return [parent1, parent2].flatMap((p) => (p == null || p.id === self ? [] : [p.id]));
}

/**
 * The sanitized record of a person. Relatives are only ids here; the caller drops the ids of
 * persons that are kept out. `sources` is filled by the caller.
 */
export function readPerson(details: Details): TreePerson {
  const forms = details.nameConclusion?.details.nameForms ?? [];
  const uk = forms.find((f) => f.lang === "uk") ?? forms.find((f) => f.lang !== "uk-Latn");
  const latin = forms.find((f) => f.lang === "uk-Latn");
  const rawGiven = orNull(uk?.givenPart);
  const split = rawGiven === null ? null : splitGiven(rawGiven);
  return {
    id: details.id,
    gender: genderOf(details.gender),
    given: split?.given ?? null,
    patronymic: split?.patronymic ?? null,
    surname: orNull(uk?.familyPart),
    latin: orNull(latin?.fullText),
    birth: readFact(details.birth),
    death: readFact(details.death),
    parents: details.parents.flatMap((p) => otherIds(p.parent1, p.parent2, details.id)),
    spouses: details.spouses.flatMap((s) =>
      otherIds(s.parent1, s.parent2, details.id).map((id) => ({
        id,
        marriage: readFact(s.event),
      })),
    ),
    sources: [],
  };
}
