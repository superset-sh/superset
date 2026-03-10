import { streamText } from "ai";
import type { AgentAgent, AgentMessage } from "@superbuilder/drizzle/schema";
import type { CoreTool } from "ai";
import { getModel } from "../providers";
import { selectModel, type RoutingContext } from "../providers";
import { buildMessages, buildSystemPrompt } from "./context-builder";

export interface ChatRequest {
  agent: AgentAgent;
  history: AgentMessage[];
  userMessage: string;
  userId: string;
  userName?: string;
  tools?: Record<string, CoreTool>;
}

export interface AgentStreamResult {
  /** 실제 사용된 모델 ID (예: "anthropic:claude-sonnet-4-5-20250929") */
  modelId: string;
  /** AI SDK streamText 반환값 */
  stream: ReturnType<typeof streamText>;
}

/** AI SDK streamText 실행 — modelId와 stream을 함께 반환 */
export function runAgentStream(request: ChatRequest): AgentStreamResult {
  const { agent, history, userMessage, userName, tools } = request;

  // 모델 라우팅
  const routingCtx: RoutingContext = {
    messageLength: userMessage.length,
    hasAttachments: false,
    toolsRequired: agent.enabledTools ?? [],
    threadLength: history.length,
  };
  const modelId = selectModel(routingCtx, agent.modelPreference ?? {});
  const model = getModel(modelId);

  const system = buildSystemPrompt(agent, userName);
  const messages = [
    ...buildMessages(history),
    { role: "user" as const, content: userMessage },
  ];

  const stream = streamText({
    model,
    system,
    messages,
    tools: tools ?? {},
    maxSteps: agent.maxSteps,
    temperature: agent.temperature,
  });

  return { modelId, stream };
}
