/**
 * LLMService - 범용 LLM 클라이언트 (멀티 프로바이더 Fallback)
 *
 * 모든 feature에서 공통으로 사용할 수 있는 AI 서비스.
 * 주제 추천, 초안 생성, 범용 chat completion을 제공한다.
 *
 * Fallback 순서: OpenAI → Gemini → Claude
 * - 각 프로바이더 호출 실패 시 자동으로 다음 프로바이더로 전환
 * - 모든 프로바이더 실패 시 마지막 에러를 사용자에게 반환
 */
import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import type {
  TopicSuggestion,
  DraftContent,
  SuggestTopicsInput,
  GenerateDraftInput,
} from "../types";

// ============================================================================
// Types
// ============================================================================

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CompletionOptions {
  model?: string;
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CompletionResult {
  content: string;
  usage: TokenUsage;
  model: string;
  provider: string;
}

export interface LLMModelInfo {
  id: string;
  name: string;
  provider: "openai" | "gemini" | "claude";
  isDefault: boolean;
}

interface ProviderConfig {
  name: string;
  call: (messages: ChatMessage[], options: CompletionOptions) => Promise<string>;
  available: () => boolean;
}

interface StreamProviderConfig {
  name: string;
  call: (messages: ChatMessage[], options: CompletionOptions) => AsyncGenerator<string>;
  available: () => boolean;
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);

  // 프로바이더별 클라이언트 (lazy init)
  private openaiClient: OpenAI | null = null;
  private geminiClient: GoogleGenerativeAI | null = null;
  private anthropicClient: Anthropic | null = null;

  /**
   * 사용 가능한 모델 목록 반환
   */
  getAvailableModels(): LLMModelInfo[] {
    const models: LLMModelInfo[] = [];

    if (process.env.ANTHROPIC_API_KEY) {
      models.push(
        { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "claude", isDefault: true },
        { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "claude", isDefault: false },
      );
    }

    if (process.env.OPENAI_API_KEY) {
      models.push(
        { id: "gpt-4o", name: "GPT-4o", provider: "openai", isDefault: false },
        { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", isDefault: false },
      );
    }

    if (process.env.GEMINI_API_KEY) {
      models.push(
        { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini", isDefault: false },
      );
    }

    return models;
  }

  /**
   * 모델 ID에서 프로바이더 판별
   */
  private getProviderForModel(modelId: string): "openai" | "gemini" | "claude" | null {
    if (modelId.startsWith("claude-")) return "claude";
    if (modelId.startsWith("gpt-")) return "openai";
    if (modelId.startsWith("gemini-")) return "gemini";
    return null;
  }

  /**
   * 범용 chat completion (자동 fallback)
   */
  async chatCompletion(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    options?: CompletionOptions,
  ): Promise<string> {
    const chatMessages = messages as ChatMessage[];
    const opts = options ?? {};

    // 특정 모델이 지정된 경우 해당 프로바이더 직접 호출
    if (opts.model) {
      const provider = this.getProviderForModel(opts.model);
      if (provider) {
        let result = await this.callProvider(provider, chatMessages, opts);
        if (opts.jsonMode) {
          result = this.stripMarkdownCodeBlock(result);
        }
        return result;
      }
    }

    const providers = this.getProviderChain();

    if (providers.length === 0) {
      throw new LLMError(
        "사용 가능한 AI 프로바이더가 없습니다. OPENAI_API_KEY, GEMINI_API_KEY, 또는 ANTHROPIC_API_KEY를 설정하세요.",
      );
    }

    let lastError: Error | null = null;

    for (const provider of providers) {
      try {
        let result = await provider.call(chatMessages, opts);
        // JSON 모드일 때 마크다운 코드블록 제거 (Claude 등이 ```json ... ``` 으로 감쌀 수 있음)
        if (opts.jsonMode) {
          result = this.stripMarkdownCodeBlock(result);
        }
        return result;
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`${provider.name} 실패 → 다음 프로바이더로 전환: ${errMsg}`);
        lastError = error instanceof Error ? error : new Error(errMsg);
      }
    }

    // 모든 프로바이더 실패
    const triedNames = providers.map((p) => p.name).join(", ");
    this.logger.error(`모든 AI 프로바이더 실패 [${triedNames}]: ${lastError?.message}`);
    throw new LLMError(
      `AI 서비스를 사용할 수 없습니다 (${triedNames} 모두 실패). 잠시 후 다시 시도해주세요.`,
    );
  }

  /**
   * 토큰 사용량을 포함한 chat completion
   */
  async chatCompletionWithUsage(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    const chatMessages = messages as ChatMessage[];
    const opts = options ?? {};

    // 특정 모델이 지정된 경우 해당 프로바이더 직접 호출
    if (opts.model) {
      const provider = this.getProviderForModel(opts.model);
      if (provider) {
        const result = await this.callProviderWithUsage(provider, chatMessages, opts);
        if (opts.jsonMode) {
          result.content = this.stripMarkdownCodeBlock(result.content);
        }
        return result;
      }
    }

    const providers = this.getProviderChain();
    if (providers.length === 0) {
      throw new LLMError(
        "사용 가능한 AI 프로바이더가 없습니다. OPENAI_API_KEY, GEMINI_API_KEY, 또는 ANTHROPIC_API_KEY를 설정하세요.",
      );
    }

    let lastError: Error | null = null;
    for (const provider of providers) {
      try {
        const providerName = provider.name.toLowerCase() as "openai" | "gemini" | "claude";
        const result = await this.callProviderWithUsage(providerName, chatMessages, opts);
        if (opts.jsonMode) {
          result.content = this.stripMarkdownCodeBlock(result.content);
        }
        return result;
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`${provider.name} 실패 → 다음 프로바이더로 전환: ${errMsg}`);
        lastError = error instanceof Error ? error : new Error(errMsg);
      }
    }

    const triedNames = providers.map((p) => p.name).join(", ");
    this.logger.error(`모든 AI 프로바이더 실패 [${triedNames}]: ${lastError?.message}`);
    throw new LLMError(
      `AI 서비스를 사용할 수 없습니다 (${triedNames} 모두 실패). 잠시 후 다시 시도해주세요.`,
    );
  }

  /**
   * 스트리밍 chat completion (자동 fallback, async generator)
   */
  async *chatCompletionStream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<string> {
    const opts = options ?? {};

    // 특정 모델이 지정된 경우 해당 프로바이더 직접 호출
    if (opts.model) {
      const provider = this.getProviderForModel(opts.model);
      if (provider) {
        yield* this.streamProvider(provider, messages, opts);
        return;
      }
    }

    const providers = this.getStreamProviderChain();

    if (providers.length === 0) {
      throw new LLMError(
        "사용 가능한 AI 프로바이더가 없습니다. OPENAI_API_KEY, GEMINI_API_KEY, 또는 ANTHROPIC_API_KEY를 설정하세요.",
      );
    }

    let lastError: Error | null = null;

    for (const provider of providers) {
      try {
        yield* provider.call(messages, opts);
        return;
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`${provider.name} stream 실패 → 다음 프로바이더로 전환: ${errMsg}`);
        lastError = error instanceof Error ? error : new Error(errMsg);
      }
    }

    const triedNames = providers.map((p) => p.name).join(", ");
    this.logger.error(`모든 AI 스트리밍 프로바이더 실패 [${triedNames}]: ${lastError?.message}`);
    throw new LLMError(
      `AI 스트리밍을 사용할 수 없습니다 (${triedNames} 모두 실패). 잠시 후 다시 시도해주세요.`,
    );
  }

  // ========================================
  // Direct Provider Call (모델 지정 시)
  // ========================================

  private async callProvider(
    provider: "openai" | "gemini" | "claude",
    messages: ChatMessage[],
    options: CompletionOptions,
  ): Promise<string> {
    switch (provider) {
      case "openai":
        return this.callOpenAI(messages, options);
      case "gemini":
        return this.callGemini(messages, options);
      case "claude":
        return this.callClaude(messages, options);
    }
  }

  private async *streamProvider(
    provider: "openai" | "gemini" | "claude",
    messages: ChatMessage[],
    options: CompletionOptions,
  ): AsyncGenerator<string> {
    switch (provider) {
      case "openai":
        yield* this.streamOpenAI(messages, options);
        break;
      case "gemini":
        yield* this.streamGemini(messages, options);
        break;
      case "claude":
        yield* this.streamClaude(messages, options);
        break;
    }
  }

  private async callProviderWithUsage(
    provider: "openai" | "gemini" | "claude",
    messages: ChatMessage[],
    options: CompletionOptions,
  ): Promise<CompletionResult> {
    switch (provider) {
      case "openai":
        return this.callOpenAIWithUsage(messages, options);
      case "gemini":
        return this.callGeminiWithUsage(messages, options);
      case "claude":
        return this.callClaudeWithUsage(messages, options);
    }
  }

  private async callOpenAIWithUsage(messages: ChatMessage[], options: CompletionOptions): Promise<CompletionResult> {
    const client = this.getOpenAI();
    const model = options.model ?? "gpt-4o-mini";
    const openaiMaxTokens = options.maxTokens ? Math.min(options.maxTokens, 16384) : undefined;
    const response = await client.chat.completions.create({
      model,
      temperature: options.temperature ?? 0.7,
      ...(openaiMaxTokens ? { max_tokens: openaiMaxTokens } : {}),
      ...(options.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      messages,
    });
    return {
      content: response.choices[0]?.message?.content ?? "",
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      model: response.model ?? model,
      provider: "openai",
    };
  }

  private async callGeminiWithUsage(messages: ChatMessage[], options: CompletionOptions): Promise<CompletionResult> {
    const genAI = this.getGemini();
    const modelId = options.model ?? "gemini-2.0-flash";
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 16384,
        ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    });

    const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
    const userParts = messages.filter((m) => m.role !== "system");

    const chat = model.startChat({
      ...(systemParts.length > 0
        ? { systemInstruction: { role: "user", parts: [{ text: systemParts.join("\n\n") }] } }
        : {}),
      history: userParts.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    });

    const lastMsg = userParts.at(-1);
    const result = await chat.sendMessage(lastMsg?.content ?? "");
    const usageMetadata = result.response.usageMetadata;
    return {
      content: result.response.text(),
      usage: {
        promptTokens: usageMetadata?.promptTokenCount ?? 0,
        completionTokens: usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: usageMetadata?.totalTokenCount ?? 0,
      },
      model: modelId,
      provider: "gemini",
    };
  }

  private async callClaudeWithUsage(messages: ChatMessage[], options: CompletionOptions): Promise<CompletionResult> {
    const client = this.getAnthropic();
    const modelId = options.model ?? "claude-sonnet-4-5-20250929";

    const systemContent = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const nonSystemMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const response = await client.messages.create({
      model: modelId,
      max_tokens: options.maxTokens ?? 16384,
      ...(systemContent ? { system: systemContent } : {}),
      messages: nonSystemMessages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return {
      content: textBlock?.text ?? "",
      usage: {
        promptTokens: response.usage?.input_tokens ?? 0,
        completionTokens: response.usage?.output_tokens ?? 0,
        totalTokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
      },
      model: response.model ?? modelId,
      provider: "claude",
    };
  }

  // ========================================
  // Provider Chain
  // ========================================

  private getProviderChain(): ProviderConfig[] {
    const all: ProviderConfig[] = [
      {
        name: "OpenAI",
        available: () => !!process.env.OPENAI_API_KEY,
        call: (msgs, opts) => this.callOpenAI(msgs, opts),
      },
      {
        name: "Gemini",
        available: () => !!process.env.GEMINI_API_KEY,
        call: (msgs, opts) => this.callGemini(msgs, opts),
      },
      {
        name: "Claude",
        available: () => !!process.env.ANTHROPIC_API_KEY,
        call: (msgs, opts) => this.callClaude(msgs, opts),
      },
    ];

    return all.filter((p) => p.available());
  }

  private getStreamProviderChain(): StreamProviderConfig[] {
    const all: StreamProviderConfig[] = [
      {
        name: "OpenAI",
        available: () => !!process.env.OPENAI_API_KEY,
        call: (msgs, opts) => this.streamOpenAI(msgs, opts),
      },
      {
        name: "Gemini",
        available: () => !!process.env.GEMINI_API_KEY,
        call: (msgs, opts) => this.streamGemini(msgs, opts),
      },
      {
        name: "Claude",
        available: () => !!process.env.ANTHROPIC_API_KEY,
        call: (msgs, opts) => this.streamClaude(msgs, opts),
      },
    ];

    return all.filter((p) => p.available());
  }

  // ========================================
  // OpenAI
  // ========================================

  private getOpenAI(): OpenAI {
    if (!this.openaiClient) {
      this.openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    }
    return this.openaiClient;
  }

  private async callOpenAI(messages: ChatMessage[], options: CompletionOptions): Promise<string> {
    const client = this.getOpenAI();
    const openaiMaxTokens = options.maxTokens ? Math.min(options.maxTokens, 16384) : undefined;
    const response = await client.chat.completions.create({
      model: options.model ?? "gpt-4o-mini",
      temperature: options.temperature ?? 0.7,
      ...(openaiMaxTokens ? { max_tokens: openaiMaxTokens } : {}),
      ...(options.jsonMode
        ? { response_format: { type: "json_object" as const } }
        : {}),
      messages,
    });
    return response.choices[0]?.message?.content ?? "";
  }

  private async *streamOpenAI(messages: ChatMessage[], options: CompletionOptions): AsyncGenerator<string> {
    const client = this.getOpenAI();
    const openaiMaxTokens = options.maxTokens ? Math.min(options.maxTokens, 16384) : undefined;
    const stream = await client.chat.completions.create({
      model: options.model ?? "gpt-4o-mini",
      temperature: options.temperature ?? 0.7,
      ...(openaiMaxTokens ? { max_tokens: openaiMaxTokens } : {}),
      stream: true,
      messages,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  // ========================================
  // Gemini
  // ========================================

  private getGemini(): GoogleGenerativeAI {
    if (!this.geminiClient) {
      this.geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    }
    return this.geminiClient;
  }

  private async callGemini(messages: ChatMessage[], options: CompletionOptions): Promise<string> {
    const genAI = this.getGemini();
    const model = genAI.getGenerativeModel({
      model: options.model ?? "gemini-2.0-flash",
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 16384,
        ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    });

    // system 메시지를 systemInstruction으로 분리
    const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
    const userParts = messages.filter((m) => m.role !== "system");

    const chat = model.startChat({
      ...(systemParts.length > 0
        ? { systemInstruction: { role: "user", parts: [{ text: systemParts.join("\n\n") }] } }
        : {}),
      history: userParts.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    });

    const lastMsg = userParts.at(-1);
    const result = await chat.sendMessage(lastMsg?.content ?? "");
    return result.response.text();
  }

  private async *streamGemini(messages: ChatMessage[], options: CompletionOptions): AsyncGenerator<string> {
    const genAI = this.getGemini();
    const model = genAI.getGenerativeModel({
      model: options.model ?? "gemini-2.0-flash",
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        ...(options.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
      },
    });

    const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
    const userParts = messages.filter((m) => m.role !== "system");

    const chat = model.startChat({
      ...(systemParts.length > 0
        ? { systemInstruction: { role: "user", parts: [{ text: systemParts.join("\n\n") }] } }
        : {}),
      history: userParts.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    });

    const lastMsg = userParts.at(-1);
    const result = await chat.sendMessageStream(lastMsg?.content ?? "");
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }

  // ========================================
  // Claude (Anthropic)
  // ========================================

  private getAnthropic(): Anthropic {
    if (!this.anthropicClient) {
      this.anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    }
    return this.anthropicClient;
  }

  private async callClaude(messages: ChatMessage[], options: CompletionOptions): Promise<string> {
    const client = this.getAnthropic();

    // system 메시지 분리
    const systemContent = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const nonSystemMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const response = await client.messages.create({
      model: options.model ?? "claude-sonnet-4-5-20250929",
      max_tokens: options.maxTokens ?? 16384,
      ...(systemContent ? { system: systemContent } : {}),
      messages: nonSystemMessages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text ?? "";
  }

  private async *streamClaude(messages: ChatMessage[], options: CompletionOptions): AsyncGenerator<string> {
    const client = this.getAnthropic();

    const systemContent = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const nonSystemMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const stream = client.messages.stream({
      model: options.model ?? "claude-sonnet-4-5-20250929",
      max_tokens: options.maxTokens ?? 16384,
      ...(systemContent ? { system: systemContent } : {}),
      messages: nonSystemMessages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  }

  // ========================================
  // 고수준 메서드 (기존 API 유지)
  // ========================================

  /**
   * 콘텐츠 컨텍스트를 분석하여 후속 주제 3~5개 추천
   */
  async suggestTopics(input: SuggestTopicsInput): Promise<TopicSuggestion[]> {
    const itemsSummary = input.items
      .map(
        (n, i) =>
          `${i + 1}. [${n.itemType}] ${n.title}: ${n.contentPreview}`
      )
      .join("\n");

    const nodeTypesHint = input.nodeTypes?.length
      ? input.nodeTypes.join("|")
      : "concept|article|reference|question|example";

    const raw = await this.chatCompletion(
      [
        {
          role: "system",
          content: `당신은 그래프 기반 지식 콘텐츠 시스템의 주제 추천 전문가입니다.
사용자의 콘텐츠 구조와 기존 항목을 분석하여 연결할 수 있는 후속 주제를 추천합니다.
추천하는 주제는 기존 항목과 의미적으로 연결되면서도 새로운 관점을 제공해야 합니다.

응답은 반드시 다음 JSON 형식으로:
{
  "topics": [
    {
      "title": "주제 제목",
      "description": "이 주제를 추천하는 이유와 간략한 설명 (2-3문장)",
      "nodeType": "${nodeTypesHint} 중 하나",
      "relevance": "기존 어떤 항목과 어떻게 연결되는지"
    }
  ]
}

3~5개의 주제를 추천하세요. 다양한 nodeType을 활용하세요.${input.brandContext ?? ""}`,
        },
        {
          role: "user",
          content: `컨텍스트: "${input.contextTitle}"${input.contextDescription ? `\n설명: ${input.contextDescription}` : ""}

기존 항목:
${itemsSummary || "(아직 항목이 없습니다)"}

위 컨텍스트에 추가하면 좋을 후속 주제를 추천해주세요.`,
        },
      ],
      { jsonMode: true }
    );

    try {
      const parsed = JSON.parse(raw);
      return (parsed.topics ?? []) as TopicSuggestion[];
    } catch (e) {
      this.logger.error("AI 응답 파싱 실패", e);
      return [];
    }
  }

  /**
   * 선택한 주제에 대해 TipTap JSON 형식의 초안 생성
   */
  async generateDraft(input: GenerateDraftInput): Promise<DraftContent> {
    const raw = await this.chatCompletion(
      [
        {
          role: "system",
          content: `당신은 그래프 기반 블로그 콘텐츠 작성 전문가입니다.
주어진 주제에 대해 TipTap 에디터 형식(ProseMirror JSON)으로 초안을 생성합니다.

응답은 반드시 다음 JSON 형식으로:
{
  "title": "노드 제목",
  "summary": "내용 요약 (1-2문장)",
  "content": {
    "type": "doc",
    "content": [
      {
        "type": "heading",
        "attrs": { "level": 2 },
        "content": [{ "type": "text", "text": "섹션 제목" }]
      },
      {
        "type": "paragraph",
        "content": [{ "type": "text", "text": "본문 내용..." }]
      },
      {
        "type": "bulletList",
        "content": [
          {
            "type": "listItem",
            "content": [
              {
                "type": "paragraph",
                "content": [{ "type": "text", "text": "항목" }]
              }
            ]
          }
        ]
      }
    ]
  }
}

heading, paragraph, bulletList, orderedList, blockquote, codeBlock 노드를 활용하여 구조화된 콘텐츠를 작성하세요.
한국어로 작성하되, 전문적이고 읽기 쉬운 문체를 사용하세요.
최소 3개 섹션 이상으로 구성하고, 각 섹션에 충분한 내용을 포함하세요.${input.brandContext ?? ""}`,
        },
        {
          role: "user",
          content: `컨텍스트: "${input.contextTitle}"
주제: "${input.topicTitle}"
설명: ${input.topicDescription}
노드 타입: ${input.nodeType}
기존 항목: ${input.existingTitles.join(", ") || "없음"}

위 주제에 대한 콘텐츠 초안을 TipTap JSON 형식으로 생성해주세요.`,
        },
      ],
      { jsonMode: true }
    );

    try {
      return JSON.parse(raw) as DraftContent;
    } catch (e) {
      this.logger.error("AI 초안 파싱 실패", e);
      return {
        title: input.topicTitle,
        summary: input.topicDescription,
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "AI 초안 생성에 실패했습니다. 직접 작성해주세요.",
                },
              ],
            },
          ],
        },
      };
    }
  }

  /**
   * 이미지를 분석하여 텍스트 설명 생성 (Claude Vision API)
   */
  async describeImage(base64: string, mimeType: string): Promise<string> {
    const client = this.getAnthropic();

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
                data: base64,
              },
            },
            {
              type: "text",
              text: "이 이미지를 상세히 설명해주세요. UI 화면이라면 레이아웃, 구성요소, 텍스트 내용을 구체적으로 설명하세요. 다이어그램이라면 구조와 관계를 설명하세요. 문서 스캔이라면 내용을 텍스트로 추출하세요.",
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text ?? "[이미지 설명 생성 실패]";
  }

  /**
   * 마크다운 코드블록(```json ... ```) 제거
   * Claude 등 일부 프로바이더가 JSON 응답을 코드블록으로 감싸는 경우 처리
   */
  private stripMarkdownCodeBlock(text: string): string {
    const trimmed = text.trim();
    // 완전한 코드블록: ```json ... ```
    const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
    if (match) {
      return match[1]!.trim();
    }
    // 잘린 코드블록: ```json ... (닫는 ``` 없음 — LLM 출력 truncation)
    const openMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*)$/);
    if (openMatch) {
      return openMatch[1]!.trim();
    }
    return trimmed;
  }

  /**
   * TipTap JSON 콘텐츠에서 미리보기 텍스트 추출
   */
  extractPreview(content: unknown, maxLength = 200): string {
    if (!content || typeof content !== "object") return "";
    const doc = content as {
      content?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const texts: string[] = [];

    for (const node of doc.content ?? []) {
      for (const child of node.content ?? []) {
        if (child.text) texts.push(child.text);
      }
      if (texts.join(" ").length >= maxLength) break;
    }

    const full = texts.join(" ");
    return full.length > maxLength ? full.slice(0, maxLength) + "..." : full;
  }
}

/**
 * LLM 서비스 전용 에러 — tRPC/REST 양쪽에서 적절히 처리 가능
 */
export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMError";
  }
}
