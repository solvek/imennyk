// JSON the model returns. A fence or a sentence around the object is ignored; the object is checked
// by the caller.

/** True for a plain object, which is what a JSON object becomes. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value of a JSON text, with a markdown fence and any text around the object removed. */
export function parseJsonText(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("the model did not return JSON");
  const sliced = tryParse(trimmed.slice(start, end + 1));
  if (sliced === undefined) throw new Error("the model did not return JSON");
  return sliced;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
