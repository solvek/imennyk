// The person who runs Imennyk: one line of Markdown that goes into the credits of every run.
// It is set up once per person, in a local file outside any case: the agent asks for it when it is
// missing and writes it with `indexing operator --set`.
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { z } from "zod";

const Operator = z.object({
  /** A line of Markdown: a name, a link or a `mailto:` link. */
  credit: z.string().trim().min(1),
});

export type Operator = z.infer<typeof Operator>;

/** Parses the text of `operator.yaml` (see `skills/imennyk/assets/operator.sample.yaml`). */
export function parseOperator(text: string): Operator {
  return Operator.parse(parse(text));
}

/** The text of `operator.yaml` for a credit line; refuses a blank one. */
export function formatOperator(credit: string): string {
  const operator = Operator.parse({ credit });
  return `# Who runs Imennyk: this line goes into the credits of every run.\n${stringify(operator)}`;
}

/**
 * Where the operator file of this person lives: `$IMENNYK_OPERATOR` when set, otherwise
 * `operator.yaml` in the `imennyk` folder of the user's configuration
 * (`$XDG_CONFIG_HOME`, by default `~/.config`). Environment and home are passed in.
 */
export function operatorPath(
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): string {
  const explicit = env.IMENNYK_OPERATOR;
  if (explicit !== undefined && explicit !== "") return explicit;
  const config = env.XDG_CONFIG_HOME;
  return join(
    config !== undefined && config !== "" ? config : join(home, ".config"),
    "imennyk",
    "operator.yaml",
  );
}

/** What the agent is told when nobody has set up the operator yet. */
export function missingOperatorMessage(path: string): string {
  return (
    `the operator is not set up (${path} is missing). Ask the person who runs the indexing how ` +
    `to credit them (a name, and a link or an e-mail if they wish), then run ` +
    `\`indexing operator --set "[Name](mailto:name@example.org)"\` and try again.`
  );
}
