// A box the model places outside the scan would reject the whole page. Such a box is dropped and
// the rest of the reading is kept: the words matter more than a rectangle that missed the page.

import type { Reading } from "../indexing/reading.ts";
import { readingSchema } from "../indexing/reading.ts";
import { isRecord } from "./json.ts";

/** The same reading with every box that falls outside the scan removed. */
export function dropOutsideBoxes(reading: Reading, width: number, height: number): Reading {
  const copy: unknown = JSON.parse(JSON.stringify(reading)) as unknown;
  walk(copy, width, height);
  return readingSchema.parse(copy);
}

function walk(value: unknown, width: number, height: number): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, width, height);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (isBoxKey(key) && isOutside(child, width, height)) dropBox(value, key);
    else walk(child, width, height);
  }
}

function isBoxKey(key: string): boolean {
  return key === "box" || key === "given_box" || key === "patronymic_box" || key === "surname_box";
}

/** Deletes a box property by its known name. A computed key cannot be deleted. */
function dropBox(record: Record<string, unknown>, key: string): void {
  if (key === "box") delete record.box;
  else if (key === "given_box") delete record.given_box;
  else if (key === "patronymic_box") delete record.patronymic_box;
  else if (key === "surname_box") delete record.surname_box;
}

function isOutside(value: unknown, width: number, height: number): boolean {
  if (!isRecord(value)) return false;
  const { x, y, w, h } = value;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof w !== "number" ||
    typeof h !== "number"
  ) {
    return false;
  }
  return x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > width || y + h > height;
}
