// How a marriage spread is cut before the model sees it. The whole page is too small to read; the
// same six strips (three on each page) are what a person uses for this form.

export interface Strip {
  readonly name: string;
  /** Left of the strip, in pixels of the scan. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Enlargement sent to the model. The handwriting is what costs, and what has to stay legible. */
  readonly scale: number;
}

/**
 * Six strips of a spread: the left page and the right page, each in three bands from top to
 * bottom, overlapping so a line on a boundary is whole in one of them. Every strip stays inside
 * the scan.
 */
export function marriageStrips(width: number, height: number): Strip[] {
  if (width < 2 || height < 2) throw new Error("the scan is too small to cut");
  const pages = [
    { name: "L", from: 0.05, to: 0.5 },
    { name: "R", from: 0.5, to: 0.97 },
  ];
  const top = Math.round(height * 0.05);
  const bottom = Math.round(height * 0.98);
  const span = Math.max(1, bottom - top);
  const bands = 3;
  const overlap = Math.round((span / bands) * 0.15);
  const step = Math.max(1, Math.round((span - overlap) / bands));
  const band = Math.min(span, step + overlap);
  const strips: Strip[] = [];
  for (const page of pages) {
    const x = clamp(Math.round(width * page.from), 0, width - 1);
    const right = clamp(Math.round(width * page.to), x + 1, width);
    for (let bandIndex = 0; bandIndex < bands; bandIndex += 1) {
      const y = clamp(top + bandIndex * step, 0, height - 1);
      const lower = clamp(y + band, y + 1, height);
      strips.push({
        name: `${page.name}${String(bandIndex + 1)}`,
        x,
        y,
        w: right - x,
        h: lower - y,
        scale: 1.6,
      });
    }
  }
  return strips;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
