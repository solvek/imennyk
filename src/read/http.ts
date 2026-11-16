// One call to a model that can see images. Providers sit behind this, so a run names the model
// (`openai:gpt-6-sol`, `anthropic:claude-sonnet-5-5`) and the rest of the reading does not change.
// Keys come from the environment under Imennyk's own names, not the names other tools already use.

export type Effort = "low" | "medium" | "high";

export interface ModelImage {
  readonly name: string;
  readonly mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  readonly bytes: Uint8Array;
}

export interface ModelUsage {
  readonly inputTokens: number;
  readonly cachedTokens: number;
  readonly outputTokens: number;
}

export interface ModelRequest {
  readonly instructions: string;
  readonly prompt: string;
  readonly images: readonly ModelImage[];
  readonly effort: Effort;
}

export interface ModelReply {
  readonly text: string;
  readonly usage: ModelUsage;
}

export interface ReadingModel {
  readonly id: string;
  complete(request: ModelRequest): Promise<ModelReply>;
}

/** The model refused or the service failed. `status` is the HTTP status, 0 when there was none. */
export class ModelError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ModelError";
    this.status = status;
  }
}

export interface HttpOptions {
  readonly fetchFn?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly maxRetries?: number;
  readonly baseUrl?: string;
}

/** A JSON POST that waits out a rate limit or a server error and then tries again. */
export async function postJson(
  url: string,
  headers: Readonly<Record<string, string>>,
  body: unknown,
  options: HttpOptions,
): Promise<unknown> {
  const fetchFn = options.fetchFn ?? fetch;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxRetries = options.maxRetries ?? 4;
  let last: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response: Response;
    try {
      response = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    } catch (error) {
      last = error instanceof Error ? error : new ModelError("the request failed", 0);
      await sleep(500 * (attempt + 1));
      continue;
    }
    const text = await response.text();
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * (attempt + 1);
      last = new ModelError(text.slice(0, 500), response.status);
      await sleep(wait);
      continue;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new ModelError(text.slice(0, 500), response.status);
    }
    if (!response.ok)
      throw new ModelError(messageOf(payload) ?? text.slice(0, 500), response.status);
    return payload;
  }
  throw last ?? new ModelError("the request failed", 0);
}

function messageOf(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  if (!("error" in payload)) return undefined;
  const error = payload.error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;
    return typeof message === "string" ? message : undefined;
  }
  return typeof error === "string" ? error : undefined;
}

/** `provider:model`, for example `openai:gpt-6-sol`. */
export function parseModelSpec(spec: string): {
  readonly provider: string;
  readonly model: string;
} {
  const colon = spec.indexOf(":");
  if (colon <= 0 || colon === spec.length - 1) {
    throw new Error(`a model is provider:name, for example openai:gpt-6-sol: ${spec}`);
  }
  return { provider: spec.slice(0, colon), model: spec.slice(colon + 1) };
}
