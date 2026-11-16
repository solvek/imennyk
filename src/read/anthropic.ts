// Anthropic Messages API. The key is `IMENNYK_ANTHROPIC_KEY`. The name `ANTHROPIC_API_KEY` is left
// unset on purpose: Claude Code treats that name as its own key and bills the API.

import { z } from "zod";
import {
  type HttpOptions,
  ModelError,
  type ModelReply,
  type ModelRequest,
  type ReadingModel,
  postJson,
} from "./http.ts";

const replySchema = z.object({
  stop_reason: z.string().nullable().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
    })
    .optional(),
});

export interface AnthropicOptions extends HttpOptions {
  readonly apiKey: string;
  readonly model: string;
}

/** A model on the Anthropic Messages API. */
export function anthropicModel(options: AnthropicOptions): ReadingModel {
  const base = options.baseUrl ?? "https://api.anthropic.com/v1";
  return {
    id: `anthropic:${options.model}`,
    async complete(request: ModelRequest): Promise<ModelReply> {
      const payload = replySchema.parse(
        await postJson(
          `${base}/messages`,
          { "x-api-key": options.apiKey, "anthropic-version": "2023-06-01" },
          {
            model: options.model,
            max_tokens: 8000,
            system: request.instructions,
            messages: [
              {
                role: "user",
                content: [
                  ...request.images.map((image) => ({
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: image.mediaType,
                      data: Buffer.from(image.bytes).toString("base64"),
                    },
                  })),
                  { type: "text", text: request.prompt },
                ],
              },
            ],
          },
          options,
        ),
      );
      if (payload.stop_reason === "max_tokens") {
        throw new ModelError("the answer was cut off (max_tokens)", 200);
      }
      const text = (payload.content ?? [])
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("");
      if (text === "") throw new ModelError("the model returned no text", 200);
      return {
        text,
        usage: {
          inputTokens: payload.usage?.input_tokens ?? 0,
          cachedTokens: payload.usage?.cache_read_input_tokens ?? 0,
          outputTokens: payload.usage?.output_tokens ?? 0,
        },
      };
    },
  };
}
