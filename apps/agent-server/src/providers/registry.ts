import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { createProviderRegistry, customProvider } from "ai";

export const registry = createProviderRegistry({
  anthropic,
  openai,
  google,

  // 용도별 모델 별칭
  atlas: customProvider({
    languageModels: {
      fast: openai("gpt-4o-mini"),
      default: anthropic("claude-sonnet-4-5-20250929"),
      reasoning: anthropic("claude-sonnet-4-5-20250929"),
      "long-context": google("gemini-2.0-flash"),
    },
    fallbackProvider: openai,
  }),
});

/** registry에서 모델 가져오기 */
export function getModel(modelId: string) {
  return registry.languageModel(modelId as Parameters<typeof registry.languageModel>[0]);
}
