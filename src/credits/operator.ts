// The person who runs Imennyk: one line of Markdown that goes into the credits.
import { parse } from "yaml";
import { z } from "zod";

const Operator = z.object({
  /** A line of Markdown: a name, a link or a `mailto:` link. */
  credit: z.string().trim().min(1),
});

export type Operator = z.infer<typeof Operator>;

/** Parses the text of `operator.yaml` (see `operator.sample.yaml`). */
export function parseOperator(text: string): Operator {
  return Operator.parse(parse(text));
}
