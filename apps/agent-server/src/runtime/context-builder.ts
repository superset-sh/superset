import type { AgentAgent, AgentMessage } from "@superbuilder/drizzle/schema";
import type { CoreMessage } from "ai";

/** DB 메시지를 AI SDK CoreMessage 형식으로 변환 */
export function buildMessages(dbMessages: AgentMessage[]): CoreMessage[] {
  return dbMessages
    .filter((m) => m.role !== "tool")
    .map((m) => {
      if (m.role === "user") {
        return { role: "user" as const, content: m.content ?? "" };
      }
      return { role: "assistant" as const, content: m.content ?? "" };
    });
}

/** 시스템 프롬프트 조립 */
export function buildSystemPrompt(agent: AgentAgent, userName?: string): string {
  const parts: string[] = [agent.systemPrompt];

  if (userName) {
    parts.push(`\n현재 대화 중인 사용자: ${userName}`);
  }

  parts.push(
    "\n도구를 사용할 때는 반드시 사용자의 질문과 관련된 도구만 호출하세요.",
    "도구 결과를 받으면 사용자에게 자연스러운 한국어로 요약하여 전달하세요.",
  );

  return parts.join("\n");
}
