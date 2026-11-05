// The rule every tree import follows (FamilySearch, GEDCOM, Gramps, spreadsheets): a living person
// is never entered into the well. A person is entered only when there is a reason to think they
// are dead; a person whose state cannot be told is left out and named in the plan for a human look.

/** A person is presumed alive when born less than this many years before the reference year. */
export const LIVING_HORIZON_YEARS = 110;

/** What a source tells about whether a person is alive. */
export interface LivingFacts {
  /** The flag of the source itself (`living` of FamilySearch, `_LIVING` / privacy of others). */
  readonly flaggedLiving?: boolean | undefined;
  /** The source records a death (a date, or only the fact that the person is deceased). */
  readonly deathRecorded: boolean;
  /** A year of birth, when the source gives one. */
  readonly birthYear?: number | undefined;
}

export type LivingState = "living" | "dead" | "unknown";

/**
 * Whether the person is alive. The source flag wins over everything; then a recorded death; then
 * the birth year against `referenceYear` (passed in so that the result does not depend on the
 * clock). No flag, no death and no birth year: `unknown`.
 */
export function livingState(facts: LivingFacts, referenceYear: number): LivingState {
  if (facts.flaggedLiving === true) return "living";
  if (facts.deathRecorded) return "dead";
  if (facts.birthYear === undefined) return "unknown";
  return referenceYear - facts.birthYear < LIVING_HORIZON_YEARS ? "living" : "dead";
}

/** Only a person known to be dead may be entered. */
export function mayEnter(state: LivingState): boolean {
  return state === "dead";
}
