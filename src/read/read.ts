// One page: the model sees the strips and the short state, the dictionary check corrects an
// unambiguous surname, and the reading is written. A page that fails is not written, so the next
// start of the run tries it again.

import type { DatabaseSync } from "node:sqlite";
import { ZodError } from "zod";
import { ingestReading } from "../indexing/ingest.ts";
import { type Reading, readingSchema } from "../indexing/reading.ts";
import { dropOutsideBoxes } from "./boxes.ts";
import { alignSurnames } from "./dictionary.ts";
import { isRecord, parseJsonText } from "./json.ts";
import type { ModelReply, ReadingModel } from "./model.ts";
import { MARRIAGE_INSTRUCTIONS, pagePrompt } from "./prompt.ts";
import { type CarryUpdate, type ReadState, nextState, parseCarry } from "./state.ts";

export interface PageScan {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/** The model answered, but the answer is not a reading. The raw text is kept so it can be inspected. */
export class ReadError extends Error {
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = "ReadError";
    this.raw = raw;
  }
}

export interface PageResult {
  readonly state: ReadState;
  readonly usage: ModelReply["usage"];
  readonly events: number;
}

export interface StoredImage {
  readonly name: string;
  readonly mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  readonly bytes: Uint8Array;
}

/**
 * Reads one scan from strips that already exist and writes it into the run. The scan name of the
 * answer is replaced with the name of the scan, so a model that repeats the example name cannot
 * write the page onto another scan. A page that fails is not written.
 */
export async function readPreparedScan(input: {
  readonly db: DatabaseSync;
  readonly runId: number;
  readonly scan: PageScan;
  readonly images: readonly StoredImage[];
  readonly model: ReadingModel;
  readonly state: ReadState;
  readonly surnames: readonly string[];
  readonly effort: "low" | "medium" | "high";
}): Promise<PageResult> {
  const reply = await input.model.complete({
    instructions: MARRIAGE_INSTRUCTIONS,
    prompt: pagePrompt(
      input.scan.name,
      input.state,
      input.images.map((image) => image.name),
      input.surnames,
    ),
    images: input.images,
    effort: input.effort,
  });
  return acceptReply(input, reply);
}

function acceptReply(
  input: {
    readonly db: DatabaseSync;
    readonly runId: number;
    readonly scan: PageScan;
    readonly state: ReadState;
    readonly surnames: readonly string[];
  },
  reply: ModelReply,
): PageResult {
  let parsed: { reading: unknown; carry: CarryUpdate };
  try {
    parsed = parseReply(reply.text);
  } catch (error) {
    throw new ReadError(error instanceof Error ? error.message : "bad reply", reply.text);
  }
  let reading: Reading;
  try {
    const body = isRecord(parsed.reading)
      ? { ...parsed.reading, scan: input.scan.name }
      : parsed.reading;
    reading = dropOutsideBoxes(readingSchema.parse(body), input.scan.width, input.scan.height);
  } catch (error) {
    const message = error instanceof ZodError ? error.message : "the reading was rejected";
    throw new ReadError(message, reply.text);
  }
  reading = alignSurnames(reading, input.surnames);
  if (
    reading.events.length === 0 &&
    reading.scan_attributes.length === 0 &&
    reading.lines.length === 0
  ) {
    throw new ReadError(
      "the page has no record and no note, so it was not written and will be tried again",
      reply.text,
    );
  }
  const written = ingestReading(input.db, input.runId, reading);
  return {
    state: nextState(input.state, reading, parsed.carry),
    usage: reply.usage,
    events: written.events,
  };
}

/** A wrapped reply (`reading` and `carry`) or a bare reading. */
export function parseReply(text: string): { reading: unknown; carry: CarryUpdate } {
  const value = parseJsonText(text);
  if (isRecord(value) && "reading" in value) {
    return { reading: value.reading, carry: parseCarry(value.carry) };
  }
  return { reading: value, carry: {} };
}
