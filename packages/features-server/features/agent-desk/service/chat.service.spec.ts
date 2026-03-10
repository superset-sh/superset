import { ChatService } from "./chat.service";

// Mock LLMService
const mockLLMService = {
  chatCompletion: jest.fn(),
  chatCompletionStream: jest.fn(),
};

// Mock features/ai module
jest.mock("@/features/ai", () => ({
  LLMService: jest.fn().mockImplementation(() => mockLLMService),
}));

// Mock logger
jest.mock("@/core/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock prompts
jest.mock("../prompts", () => ({
  CUSTOMER_SYSTEM_PROMPT: "You are a customer service agent.",
  OPERATOR_SYSTEM_PROMPT: "You are a feature development analyst.",
  CUSTOMER_WELCOME: "안녕하세요! 서비스 생성 도우미입니다.",
  OPERATOR_WELCOME: "안녕하세요! Feature 개발 분석을 도와드리겠습니다.",
}));

describe("ChatService", () => {
  let service: ChatService;

  beforeEach(() => {
    // Directly construct service with mock dependency (bypasses NestJS DI)
    service = new ChatService(mockLLMService as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getWelcomeMessage", () => {
    it("should return customer welcome message for customer type", () => {
      const result = service.getWelcomeMessage("customer");
      expect(result).toBe("안녕하세요! 서비스 생성 도우미입니다.");
    });

    it("should return operator welcome message for operator type", () => {
      const result = service.getWelcomeMessage("operator");
      expect(result).toBe("안녕하세요! Feature 개발 분석을 도와드리겠습니다.");
    });
  });

  describe("chat", () => {
    it("should call LLMService.chatCompletion with correct messages", async () => {
      mockLLMService.chatCompletion.mockResolvedValue("AI 응답입니다.");

      const result = await service.chat(
        "customer",
        [{ role: "user", content: "이전 메시지" }],
        "새 메시지",
      );

      expect(result).toBe("AI 응답입니다.");
      expect(mockLLMService.chatCompletion).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: "system" }),
          expect.objectContaining({ role: "user", content: "이전 메시지" }),
          expect.objectContaining({ role: "user", content: "새 메시지" }),
        ]),
        undefined,
      );
    });

    it("should include file context when provided", async () => {
      mockLLMService.chatCompletion.mockResolvedValue("파일 분석 결과입니다.");

      await service.chat("customer", [], "파일 분석해주세요", "파일 내용입니다.");

      expect(mockLLMService.chatCompletion).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("업로드된 파일 내용"),
          }),
        ]),
        undefined,
      );
    });

    it("should use operator system prompt for operator type", async () => {
      mockLLMService.chatCompletion.mockResolvedValue("분석 결과");

      await service.chat("operator", [], "Feature 분석");

      expect(mockLLMService.chatCompletion).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: "You are a feature development analyst.",
          }),
        ]),
        undefined,
      );
    });
  });

  describe("streamChat", () => {
    it("should yield chunks from LLMService stream", async () => {
      const mockChunks = ["안녕", "하세요", "!"];
      mockLLMService.chatCompletionStream.mockImplementation(async function* () {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      });

      const chunks: string[] = [];
      for await (const chunk of service.streamChat("customer", [], "인사해주세요")) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(mockChunks);
      expect(mockLLMService.chatCompletionStream).toHaveBeenCalled();
    });

    it("should include file context in stream messages", async () => {
      mockLLMService.chatCompletionStream.mockImplementation(async function* () {
        yield "결과";
      });

      const chunks: string[] = [];
      for await (const chunk of service.streamChat("customer", [], "분석해주세요", "파일 내용")) {
        chunks.push(chunk);
      }

      expect(mockLLMService.chatCompletionStream).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("업로드된 파일 내용"),
          }),
        ]),
        undefined,
      );
    });
  });
});
