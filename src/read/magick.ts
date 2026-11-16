// ImageMagick does the cutting. The plan of the strips is pure; this only runs it.

import { execFileSync } from "node:child_process";
import type { ImageSize } from "./image.ts";
import type { ModelImage } from "./model.ts";
import { type Strip, marriageStrips } from "./strips.ts";

/** The size of an image ImageMagick can read, when the file is not a plain png or jpeg. */
export function magickSize(bytes: Uint8Array): ImageSize {
  const detected = run(["identify", "-format", "%w %h", "-"], bytes).toString("utf8");
  const [width, height] = detected.trim().split(" ").map(Number);
  if (
    width === undefined ||
    height === undefined ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new Error(`ImageMagick did not report a size: ${detected.trim()}`);
  }
  return { width, height };
}

/** The six strips of a marriage spread, enlarged, each with a ruler of the scan's own pixels. */
export function magickStrips(bytes: Uint8Array, size: ImageSize): ModelImage[] {
  return marriageStrips(size.width, size.height).map((strip) => ({
    name: strip.name,
    mediaType: "image/jpeg" as const,
    bytes: new Uint8Array(run(stripArgs(strip), bytes)),
  }));
}

function stripArgs(strip: Strip): string[] {
  const args = [
    "-",
    "-crop",
    `${String(strip.w)}x${String(strip.h)}+${String(strip.x)}+${String(strip.y)}`,
    "+repage",
    "-fill",
    "red",
    "-stroke",
    "red",
  ];
  for (let tick = Math.ceil(strip.y / 50) * 50; tick < strip.y + strip.h; tick += 50) {
    const y = tick - strip.y;
    const len = tick % 100 === 0 ? 48 : 24;
    args.push("-strokewidth", "3", "-draw", `line 0,${String(y)} ${String(len)},${String(y)}`);
    if (tick % 100 === 0) {
      args.push(
        "-stroke",
        "none",
        "-pointsize",
        "28",
        "-annotate",
        `+52+${String(y + 8)}`,
        String(tick),
        "-stroke",
        "red",
      );
    }
  }
  args.push("-resize", `${String(Math.round(strip.scale * 100))}%`, "-quality", "82", "jpeg:-");
  return args;
}

function run(args: string[], bytes: Uint8Array): Buffer {
  try {
    return execFileSync("magick", args, {
      input: Buffer.from(bytes),
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "magick failed";
    throw new Error(`ImageMagick (magick) could not read the scan: ${detail}`, { cause: error });
  }
}
