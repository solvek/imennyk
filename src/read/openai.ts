// OpenAI Responses API. The key is `IMENNYK_OPENAI_KEY`, so a shell that also runs Claude Code
// does not pick the key up as its own.

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
  status: z.string().optional(),
  incomplete_details: z.object({ reason: z.string().optional() }).nullable().optional(),
  output_text: z.string().optional(),
  output: z
    .array(
      z.object({
        type: z.string().optional(),
        content: z
          .array(z.object({ type: z.string().optional(), text: z.string().optional() }))
          .optional(),
      }),
    )
    .optional(),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      input_tokens_details: z.object({ cached_tokens: z.number().optional() }).optional(),
    })
    .optional(),
});

export interface OpenAiOptions extends HttpOptions {
  readonly apiKey: string;
  readonly model: string;
}

/** A model on the OpenAI Responses API. Images go in the user message; the instructions stand alone. */
export function openAiModel(options: OpenAiOptions): ReadingModel {
  const base = options.baseUrl ?? "https://api.openai.com/v1";
  return {
    id: `openai:${options.model}`,
    async complete(request: ModelRequest): Promise<ModelReply> {
      const payload = replySchema.parse(
        await postJson(
          `${base}/responses`,
          { authorization: `Bearer ${options.apiKey}` },
          {
            model: options.model,
            store: false,
            instructions: request.instructions,
            reasoning: { effort: request.effort },
            text: { format: { type: "json_object" } },
            input: [
              {
                role: "user",
                content: [
                  { type: "input_text", text: request.prompt },
                  ...request.images.map((image) => ({
                    type: "input_image",
                    detail: "high",
                    image_url: `data:${image.mediaType};base64,${Buffer.from(image.bytes).toString("base64")}`,
                  })),
                ],
              },
            ],
          },
          options,
        ),
      );
      if (payload.status === "incomplete") {
        throw new ModelError(
          `the answer was cut off (${payload.incomplete_details?.reason ?? "incomplete"})`,
          200,
        );
      }
      const text =
        payload.output_text ??
        payload.output
          ?.flatMap((item) => item.content ?? [])
          .map((part) => part.text)
          .filter((part) => part !== undefined)
          .join("") ??
        "";
      if (text === "") throw new ModelError("the model returned no text", 200);
      return {
        text,
        usage: {
          inputTokens: payload.usage?.input_tokens ?? 0,
          cachedTokens: payload.usage?.input_tokens_details?.cached_tokens ?? 0,
          outputTokens: payload.usage?.output_tokens ?? 0,
        },
      };
    },
  };
}
