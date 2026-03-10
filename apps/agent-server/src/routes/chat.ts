import { Hono } from "hono";
import { stream } from "hono/streaming";
import { z } from "zod";
import { authMiddleware, getUser } from "../lib/auth";
import { agentService, threadService, messageService } from "../services";
import { usageService } from "../services/usage.service";
import { runAgentStream } from "../runtime";
import { getToolsForAgent } from "../tools";
import {
  checkCredits,
  deductCredits,
  calculateCredits,
  CreditError,
} from "../lib/credit-client";

const chatRoute = new Hono();

const chatInputSchema = z.object({
  agentId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  message: z.string().min(1).max(10000),
});

/** 최소 예상 크레딧 (사전 체크용) */
const MINIMUM_ESTIMATED_CREDITS = 5;

chatRoute.post("/stream", authMiddleware, async (c) => {
  const body = await c.req.json();
  const parsed = chatInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  }

  const input = parsed.data;
  const user = getUser(c);
  const jwt = c.req.header("Authorization")?.replace("Bearer ", "") ?? "";

  // ========== 크레딧 사전 체크 ==========
  try {
    const balanceCheck = await checkCredits(jwt, MINIMUM_ESTIMATED_CREDITS);
    if (!balanceCheck.sufficient) {
      return c.json(
        {
          error: "Insufficient credits",
          currentBalance: balanceCheck.currentBalance,
          required: MINIMUM_ESTIMATED_CREDITS,
          purchaseUrl: "/payment/credits",
        },
        402,
      );
    }
  } catch (err) {
    // 크레딧 서버 연결 실패 시 — 경고만 로그하고 진행 (graceful degradation)
    if (err instanceof CreditError) {
      console.warn(`[Credit Check] Failed: ${err.message}`);
    } else {
      console.warn(
        "[Credit Check] Atlas server unreachable, proceeding without credit check",
      );
    }
  }

  // 에이전트 조회
  let agent;
  if (input.agentId) {
    agent = await agentService.getById(input.agentId);
  } else {
    agent = await agentService.getDefault();
  }

  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  // 스레드 조회 또는 생성
  let threadId = input.threadId;
  if (!threadId) {
    const thread = await threadService.create({
      agentId: agent.id,
      userId: user.id,
      title: input.message.slice(0, 100),
    });
    threadId = thread.id;
  }

  // 사용자 메시지 저장
  await messageService.create({
    threadId,
    role: "user",
    content: input.message,
  });

  // 이전 메시지 로드
  const history = await messageService.listByThread(threadId);

  // AI 스트리밍 실행
  const tools = getToolsForAgent(agent.enabledTools ?? []);
  const startTime = Date.now();
  const { modelId, stream: result } = runAgentStream({
    agent,
    history,
    userMessage: input.message,
    userId: user.id,
    tools,
  });

  // SSE 스트리밍
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");

  return stream(c, async (streamWriter) => {
    // threadId를 먼저 전달
    await streamWriter.write(
      `event: thread\ndata: ${JSON.stringify({ threadId })}\n\n`,
    );

    let fullText = "";

    for await (const chunk of result.textStream) {
      fullText += chunk;
      await streamWriter.write(
        `event: text-delta\ndata: ${JSON.stringify({ text: chunk })}\n\n`,
      );
    }

    // 완료 후 사용량 조회 및 assistant 메시지 저장
    const usage = await result.usage;
    const steps = await result.steps;
    const toolCallCount = steps.reduce(
      (sum, step) => sum + (step.toolCalls?.length ?? 0),
      0,
    );
    const durationMs = Date.now() - startTime;

    await messageService.create({
      threadId,
      role: "assistant",
      content: fullText,
      modelId,
      tokenUsage: usage
        ? {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.promptTokens + usage.completionTokens,
          }
        : undefined,
    });

    // lastMessageAt 업데이트
    await threadService.touchLastMessage(threadId);

    // ========== 사용량 로그 기록 ==========
    if (usage) {
      try {
        await usageService.log({
          agentId: agent.id,
          userId: user.id,
          threadId,
          modelId,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          toolCallCount,
          durationMs,
        });
      } catch (err) {
        console.error(
          "[Usage Log] Failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    // ========== 크레딧 차감 ==========
    if (usage) {
      try {
        const credits = await calculateCredits(
          jwt,
          modelId,
          usage.promptTokens,
          usage.completionTokens,
        );

        if (credits > 0) {
          await deductCredits(jwt, credits, {
            modelId,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.promptTokens + usage.completionTokens,
            threadId,
          });
        }
      } catch (err) {
        // 크레딧 차감 실패 — 로그만 기록 (AI 응답은 이미 전달됨)
        console.error(
          "[Credit Deduct] Failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    // finish 이벤트
    await streamWriter.write(
      `event: finish\ndata: ${JSON.stringify({ threadId, usage })}\n\n`,
    );
  });
});

export { chatRoute };
