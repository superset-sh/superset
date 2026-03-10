import type { ModelPreference } from "@superbuilder/drizzle/schema";

export interface RoutingContext {
  messageLength: number;
  hasAttachments: boolean;
  toolsRequired: string[];
  threadLength: number;
}

/**
 * 작업 유형에 따라 최적 모델을 자동 선택
 */
export function selectModel(
  ctx: RoutingContext,
  preference: ModelPreference = {},
): string {
  // 1. 긴 컨텍스트 → Gemini
  if (ctx.threadLength > 50 || ctx.hasAttachments) {
    return preference.longContext ?? "google:gemini-2.0-flash";
  }

  // 2. 쓰기 작업 → Claude
  const hasWriteTools = ctx.toolsRequired.some(
    (t) => t.includes("create") || t.includes("update"),
  );
  if (hasWriteTools) {
    return preference.reasoning ?? "anthropic:claude-sonnet-4-5-20250929";
  }

  // 3. 간단한 조회 → GPT-4o Mini
  if (ctx.messageLength < 100 && ctx.toolsRequired.length <= 1) {
    return preference.fast ?? "openai:gpt-4o-mini";
  }

  // 4. 기본 → Claude Sonnet
  return preference.default ?? "anthropic:claude-sonnet-4-5-20250929";
}
