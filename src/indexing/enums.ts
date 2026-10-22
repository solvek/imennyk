import type {
  DdbDateQual,
  DdbEventType,
  DdbGender,
  DdbPlaceType,
  DdbTieType,
} from "../../generated/db.ts";

// Same values as the ddb enums; a test compares them with `pg_enum`, and the CHECK lists in
// `migrations/0001_init.sql` accept exactly these.

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
] as const satisfies readonly DdbEventType[];

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
] as const satisfies readonly DdbTieType[];

export const DATE_QUALS = [
  "exact",
  "calculated",
  "estimated",
  "about",
] as const satisfies readonly DdbDateQual[];

export const GENDERS = ["male", "female"] as const satisfies readonly DdbGender[];

export const PLACE_TYPES = [
  "country",
  "region",
  "district",
  "volost",
  "parish",
  "settlement",
  "hamlet",
  "church",
  "cemetery",
  "street",
  "building",
] as const satisfies readonly DdbPlaceType[];

export const BOX_ORIGINS = ["crop", "htr_line", "manual"] as const;
export const DOUBT_ELEMENTS = [
  "surname",
  "given",
  "patronymic",
  "age",
  "gender",
  "place",
  "tie",
  "other",
] as const;

/** States of review shared by doubts and places of the sample. */
export const REVIEW_STATUSES = ["open", "confirmed", "fixed", "unknown"] as const;
/** A doubt about a tie can also end with a tie added or deleted. */
export const DOUBT_STATUSES = [...REVIEW_STATUSES, "tie_added", "tie_deleted"] as const;
