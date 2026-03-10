import { BadRequestException } from "@nestjs/common";
import { AnalyzerService } from "./analyzer.service";

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
}));

jest.mock("@superbuilder/drizzle", () => ({
  DRIZZLE: "DRIZZLE_TOKEN",
  InjectDrizzle: () => () => undefined,
  agentDeskSessions: { id: { name: "id" } },
  agentDeskFiles: { sessionId: { name: "session_id" } },
  agentDeskMessages: { sessionId: { name: "session_id" } },
}));

jest.mock("@/core/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock("@/features/ai", () => ({
  LLMService: jest.fn(),
}));

// Mock data
const mockSessionId = "223e4567-e89b-12d3-a456-426614174001";

const mockAnalysisResult = {
  features: [
    {
      name: "online-booking",
      description: "온라인 예약 시스템",
      priority: "high" as const,
      complexity: "moderate" as const,
      existingFeatures: ["auth", "payment"],
      gaps: ["캘린더 UI", "알림 시스템"],
    },
  ],
  summary: "온라인 예약 서비스 구현이 필요합니다.",
  recommendation: "auth → payment → online-booking 순서로 구현합니다.",
};

const mockSession = {
  id: mockSessionId,
  type: "customer" as const,
  status: "chatting" as const,
  title: "새 서비스 상담",
  prompt: null,
  analysisResult: null,
  spec: null,
  createdById: "123e4567-e89b-12d3-a456-426614174000",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMessages = [
  {
    id: "msg-1",
    sessionId: mockSessionId,
    role: "agent" as const,
    content: "안녕하세요! 어떤 서비스를 구축하시나요?",
    createdAt: new Date(),
  },
  {
    id: "msg-2",
    sessionId: mockSessionId,
    role: "user" as const,
    content: "온라인 예약 시스템이 필요합니다.",
    createdAt: new Date(),
  },
];

const mockFiles = [
  {
    id: "file-1",
    sessionId: mockSessionId,
    fileName: "requirements.pdf",
    originalName: "요구사항.pdf",
    mimeType: "application/pdf",
    size: 2048,
    storageUrl: "https://storage.example.com/requirements.pdf",
    parsedContent: "예약 시스템 요구사항: 날짜/시간 선택, 결제 연동",
    parsedAt: new Date(),
    createdAt: new Date(),
  },
  {
    id: "file-2",
    sessionId: mockSessionId,
    fileName: "wireframe.png",
    originalName: "와이어프레임.png",
    mimeType: "image/png",
    size: 512,
    storageUrl: "https://storage.example.com/wireframe.png",
    parsedContent: null,
    parsedAt: null,
    createdAt: new Date(),
  },
];

const mockDb = {
  query: {
    agentDeskSessions: { findFirst: jest.fn() },
    agentDeskMessages: { findMany: jest.fn() },
    agentDeskFiles: { findMany: jest.fn() },
  },
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockResolvedValue(undefined),
};

const mockLlmService = {
  chatCompletion: jest.fn(),
};

describe("AnalyzerService", () => {
  let service: AnalyzerService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset chainable mock
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb.where.mockResolvedValue(undefined);

    service = new AnalyzerService(mockDb as any, mockLlmService as any);
  });

  describe("analyze", () => {
    it("should analyze session and return AnalysisResult", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskMessages.findMany.mockResolvedValue(mockMessages);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue(mockFiles);
      mockLlmService.chatCompletion.mockResolvedValue(
        JSON.stringify(mockAnalysisResult),
      );

      const result = await service.analyze(mockSessionId);

      expect(result).toEqual(mockAnalysisResult);
      expect(mockLlmService.chatCompletion).toHaveBeenCalledTimes(1);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          analysisResult: mockAnalysisResult,
          status: "analyzed",
        }),
      );
    });

    it("should include file context for files with parsedContent", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskMessages.findMany.mockResolvedValue(mockMessages);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue(mockFiles);
      mockLlmService.chatCompletion.mockResolvedValue(
        JSON.stringify(mockAnalysisResult),
      );

      await service.analyze(mockSessionId);

      const callArgs = mockLlmService.chatCompletion.mock.calls[0][0];
      const systemMessages = callArgs.filter((m: any) => m.role === "system");
      // Should have a system message containing the file content (only parsed files)
      const hasFileContext = systemMessages.some((m: any) =>
        m.content.includes("요구사항.pdf") && m.content.includes("예약 시스템 요구사항"),
      );
      expect(hasFileContext).toBe(true);
    });

    it("should skip files without parsedContent", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskMessages.findMany.mockResolvedValue([]);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([mockFiles[1]]); // only the unparsed file
      mockLlmService.chatCompletion.mockResolvedValue(
        JSON.stringify(mockAnalysisResult),
      );

      await service.analyze(mockSessionId);

      const callArgs = mockLlmService.chatCompletion.mock.calls[0][0];
      const systemMessages = callArgs.filter((m: any) => m.role === "system");
      // Should only have the main system prompt, no file context
      expect(systemMessages).toHaveLength(1);
    });

    it("should throw BadRequestException when session is not found", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(null);

      await expect(service.analyze(mockSessionId)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockLlmService.chatCompletion).not.toHaveBeenCalled();
    });

    it("should throw BadRequestException when LLM returns invalid JSON", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskMessages.findMany.mockResolvedValue(mockMessages);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue(
        "I cannot analyze this request.",
      );

      await expect(service.analyze(mockSessionId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException when LLM returns malformed JSON", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskMessages.findMany.mockResolvedValue(mockMessages);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue("{invalid json here}");

      await expect(service.analyze(mockSessionId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should format message history correctly", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskMessages.findMany.mockResolvedValue(mockMessages);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue(
        JSON.stringify(mockAnalysisResult),
      );

      await service.analyze(mockSessionId);

      const callArgs = mockLlmService.chatCompletion.mock.calls[0][0];
      const userMessage = callArgs.find((m: any) => m.role === "user");
      expect(userMessage.content).toContain("[agent]: 안녕하세요!");
      expect(userMessage.content).toContain("[user]: 온라인 예약 시스템이 필요합니다.");
    });
  });

  describe("generateSpec", () => {
    it("should generate spec and return spec string", async () => {
      const sessionWithAnalysis = {
        ...mockSession,
        analysisResult: mockAnalysisResult,
        status: "analyzed" as const,
      };
      const mockSpec = "# 구현 스펙\n\n## online-booking Feature\n\n구현 단계:...";

      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(
        sessionWithAnalysis,
      );
      mockLlmService.chatCompletion.mockResolvedValue(mockSpec);

      const result = await service.generateSpec(mockSessionId);

      expect(result).toBe(mockSpec);
      expect(mockLlmService.chatCompletion).toHaveBeenCalledTimes(1);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          spec: mockSpec,
          status: "spec_generated",
        }),
      );
    });

    it("should pass analysis result as JSON to LLM", async () => {
      const sessionWithAnalysis = {
        ...mockSession,
        analysisResult: mockAnalysisResult,
      };
      const mockSpec = "generated spec content";

      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(
        sessionWithAnalysis,
      );
      mockLlmService.chatCompletion.mockResolvedValue(mockSpec);

      await service.generateSpec(mockSessionId);

      const callArgs = mockLlmService.chatCompletion.mock.calls[0][0];
      const userMessage = callArgs.find((m: any) => m.role === "user");
      expect(userMessage.content).toContain("online-booking");
      expect(userMessage.content).toContain("온라인 예약 시스템");
    });

    it("should throw BadRequestException when session is not found", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(null);

      await expect(service.generateSpec(mockSessionId)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockLlmService.chatCompletion).not.toHaveBeenCalled();
    });

    it("should throw BadRequestException when session has no analysis result", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession); // analysisResult is null

      await expect(service.generateSpec(mockSessionId)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockLlmService.chatCompletion).not.toHaveBeenCalled();
    });
  });
});
