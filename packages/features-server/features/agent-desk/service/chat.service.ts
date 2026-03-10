import { Injectable } from "@nestjs/common";
import { LLMService } from "../../../features/ai";
import { createLogger } from "../../../core/logger";
import { CUSTOMER_SYSTEM_PROMPT, OPERATOR_SYSTEM_PROMPT, DESIGNER_SYSTEM_PROMPT, CUSTOMER_WELCOME, OPERATOR_WELCOME, DESIGNER_WELCOME } from "../prompts";
import type { ChatMessage, SessionType } from "../types";

const logger = createLogger("agent-desk");

export interface MessageFeedback {
  role: "agent" | "user";
  content: string;
  feedback?: string | null;
}

@Injectable()
export class ChatService {
  constructor(private readonly llmService: LLMService) {}

  getWelcomeMessage(type: SessionType): string {
    if (type === "customer") return CUSTOMER_WELCOME;
    if (type === "designer") return DESIGNER_WELCOME;
    return OPERATOR_WELCOME;
  }

  private buildFeedbackContext(messageFeedbacks?: MessageFeedback[]): string | null {
    if (!messageFeedbacks?.length) return null;

    const dislikedMessages = messageFeedbacks.filter(
      (m) => m.role === "agent" && m.feedback === "dislike",
    );

    if (dislikedMessages.length === 0) return null;

    const lastDisliked = dislikedMessages[dislikedMessages.length - 1]!;
    const preview = lastDisliked.content.slice(0, 200);

    return [
      "[사용자 피드백 컨텍스트]",
      `사용자가 이전 응답에 불만족(dislike)했습니다: "${preview}..."`,
      "다른 접근 방식이나 더 구체적인 답변을 제공해주세요.",
    ].join("\n");
  }

  async *streamChat(
    type: SessionType,
    history: ChatMessage[],
    userMessage: string,
    fileContext?: string,
    model?: string,
    messageFeedbacks?: MessageFeedback[],
  ): AsyncGenerator<string> {
    const systemPrompt = type === "customer" ? CUSTOMER_SYSTEM_PROMPT : type === "designer" ? DESIGNER_SYSTEM_PROMPT : OPERATOR_SYSTEM_PROMPT;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    const feedbackContext = this.buildFeedbackContext(messageFeedbacks);
    if (feedbackContext) {
      messages.push({ role: "system", content: feedbackContext });
    }

    if (fileContext) {
      messages.push({
        role: "system",
        content: `업로드된 파일 내용:\n${fileContext}`,
      });
    }

    messages.push(...history);
    messages.push({ role: "user", content: userMessage });

    logger.info("Chat stream started", {
      "agent_desk.type": type,
      "agent_desk.model": model ?? "default",
      "agent_desk.message_count": messages.length,
      "agent_desk.has_feedback_context": !!feedbackContext,
    });

    yield* this.llmService.chatCompletionStream(messages, model ? { model } : undefined);
  }

  async chat(
    type: SessionType,
    history: ChatMessage[],
    userMessage: string,
    fileContext?: string,
    model?: string,
    messageFeedbacks?: MessageFeedback[],
  ): Promise<string> {
    const systemPrompt = type === "customer" ? CUSTOMER_SYSTEM_PROMPT : type === "designer" ? DESIGNER_SYSTEM_PROMPT : OPERATOR_SYSTEM_PROMPT;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    const feedbackContext = this.buildFeedbackContext(messageFeedbacks);
    if (feedbackContext) {
      messages.push({ role: "system", content: feedbackContext });
    }

    if (fileContext) {
      messages.push({
        role: "system",
        content: `업로드된 파일 내용:\n${fileContext}`,
      });
    }

    messages.push(...history);
    messages.push({ role: "user", content: userMessage });

    logger.info("Chat completion started", {
      "agent_desk.type": type,
      "agent_desk.model": model ?? "default",
      "agent_desk.message_count": messages.length,
      "agent_desk.has_feedback_context": !!feedbackContext,
    });

    return this.llmService.chatCompletion(messages, model ? { model } : undefined);
  }
}
