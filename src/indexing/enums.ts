// The vocabulary of the bank. The values are those of the enums of the Grapa database, which loads
// banks; the CHECK lists in `migrations/` accept exactly these.

export const EVENT_TYPES = [
  "birth",
  "baptism",
  "marriage",
  "banns",
  "divorce",
  "death",
  "burial",
  "census",
  "confession",
  "residence",
  "occupation",
  "military",
  "emigration",
  "education",
  "property",
] as const;

export const TIE_TYPES = [
  "child",
  "spouse",
  "godparent",
  "friend",
  "witness",
  "officiant",
  "informant",
  "mentioned",
  "kin",
  "relative",
] as const;

export const DATE_QUALS = ["exact", "calculated", "estimated", "about"] as const;

export const GENDERS = ["male", "female"] as const;

export const PLACE_TYPES = [
  "country",
  "region",
  "district",
  "volost",
  "parish",
  "settlement",
  "colony",
  "hamlet",
  "church",
  "cemetery",
  "street",
  "building",
] as const;

export const BOX_ORIGINS = ["crop", "htr_line", "manual"] as const;
/** A doubt is only about a word that was read: a name part or the name of a place. */
export const DOUBT_ELEMENTS = ["surname", "given", "patronymic", "place"] as const;

/** States of review shared by doubts and places of the sample. */
export const REVIEW_STATUSES = ["open", "confirmed", "fixed", "unknown"] as const;
