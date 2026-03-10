import type { CoreTool } from "ai";

const ALL_TOOLS: Record<string, CoreTool> = {};

/**
 * 도구 이름을 AI SDK 호환 형식으로 변환
 * Anthropic API 도구 이름 규칙: ^[a-zA-Z0-9_-]{1,64}$
 * 점(.)은 허용되지 않으므로 언더스코어(_)로 변환
 */
function toSafeName(name: string): string {
  return name.replace(/\./g, "_");
}

/** 도구 등록 */
export function registerTools(tools: Record<string, CoreTool>) {
  Object.assign(ALL_TOOLS, tools);
}

/** 에이전트 설정의 enabledTools에 따라 허용된 도구만 반환 (AI SDK 호환 이름으로 변환) */
export function getToolsForAgent(enabledTools: string[]): Record<string, CoreTool> {
  if (enabledTools.length === 0) return {};

  return Object.fromEntries(
    enabledTools
      .filter((name) => name in ALL_TOOLS)
      .map((name) => [toSafeName(name), ALL_TOOLS[name]]),
  );
}

/** 등록된 전체 도구 목록 (Admin용, 원본 이름) */
export function getAllToolNames(): string[] {
  return Object.keys(ALL_TOOLS);
}
