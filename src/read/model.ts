// Which model a run uses. A provider that is not connected yet fails here, with its name, instead
// of somewhere inside a page.

import { anthropicModel } from "./anthropic.ts";
import { type HttpOptions, type ReadingModel, parseModelSpec } from "./http.ts";
import { openAiModel } from "./openai.ts";

export type { Effort, ModelImage, ModelReply, ModelRequest, ReadingModel } from "./http.ts";
export { ModelError, parseModelSpec } from "./http.ts";

/** The model a marriage book is read with when the command line does not name one. */
export const DEFAULT_MODEL = "openai:gpt-6-sol";

/**
 * The model named by `spec` (`openai:gpt-6-sol`, `anthropic:claude-sonnet-5-5`). The key is
 * `IMENNYK_OPENAI_KEY` or `IMENNYK_ANTHROPIC_KEY`.
 */
export function createModel(
  spec: string,
  env: Readonly<Record<string, string | undefined>>,
  options: HttpOptions = {},
): ReadingModel {
  const { provider, model } = parseModelSpec(spec);
  if (provider === "openai") {
    return openAiModel({ ...options, apiKey: requiredKey(env, "IMENNYK_OPENAI_KEY"), model });
  }
  if (provider === "anthropic") {
    return anthropicModel({ ...options, apiKey: requiredKey(env, "IMENNYK_ANTHROPIC_KEY"), model });
  }
  throw new Error(
    `the provider «${provider}» is not connected; connected providers are openai and anthropic`,
  );
}

function requiredKey(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const key = env[name];
  if (key === undefined || key === "") {
    throw new Error(`${name} is not set; put it in the environment or in .env of the repository`);
  }
  return key;
}
