import { BadRequestException } from "@nestjs/common";
import { DiagramGeneratorService } from "./diagram-generator.service";

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
}));

jest.mock("@superbuilder/drizzle", () => ({
  DRIZZLE: "DRIZZLE_TOKEN",
  InjectDrizzle: () => () => undefined,
  agentDeskSessions: { id: { name: "id" } },
  agentDeskFiles: { sessionId: { name: "session_id" } },
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

// ============================================================================
// Mock data
// ============================================================================

const mockSessionId = "223e4567-e89b-12d3-a456-426614174001";
const mockUserId = "123e4567-e89b-12d3-a456-426614174000";

const mockCachedDiagrams = {
  diagrams: [
    {
      type: "flowchart",
      title: "예약 프로세스",
      description: "예약 흐름 다이어그램",
      mermaidCode: "graph TD\\n    A[시작] --> B[예약]",
    },
  ],
  summary: "캐시된 다이어그램 요약",
};

const mockSession = {
  id: mockSessionId,
  type: "customer" as const,
  status: "analyzed" as const,
  title: "예약 서비스 분석",
  prompt: "온라인 예약 시스템을 만들어 주세요",
  analysisResult: {
    features: [
      {
        name: "booking",
        description: "예약 관리",
        priority: "high",
        complexity: "moderate",
        existingFeatures: ["auth"],
        gaps: ["캘린더 UI"],
      },
    ],
    summary: "예약 시스템 분석 완료",
    recommendation: "auth → booking 순서",
  },
  diagrams: null,
  spec: null,
  createdById: mockUserId,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSessionWithDiagrams = {
  ...mockSession,
  diagrams: mockCachedDiagrams,
};

const mockSessionNoAnalysis = {
  ...mockSession,
  analysisResult: null,
  diagrams: null,
};

const mockSessionMinimal = {
  ...mockSession,
  title: null,
  prompt: null,
  analysisResult: null,
  diagrams: null,
};

const mockParsedFiles = [
  {
    id: "file-1",
    sessionId: mockSessionId,
    originalName: "요구사항.pdf",
    parsedContent: "예약 시스템 요구사항 내용",
  },
  {
    id: "file-2",
    sessionId: mockSessionId,
    originalName: "와이어프레임.png",
    parsedContent: null,
  },
];

const mockDiagramsResponse = JSON.stringify({
  diagrams: [
    {
      type: "flowchart",
      title: "예약 프로세스",
      description: "예약 흐름 다이어그램",
      mermaidCode: "graph TD\\n    A[시작] --> B[예약]",
    },
    {
      type: "er",
      title: "데이터 모델",
      description: "엔티티 관계도",
      mermaidCode: "erDiagram\\n    USER ||--o{ BOOKING : makes",
    },
  ],
  summary: "예약 시스템의 프로세스 흐름과 데이터 모델",
});

const mockSingleDiagramResponse = JSON.stringify({
  diagram: {
    type: "sequence",
    title: "API 호출 흐름",
    description: "예약 API 시퀀스",
    mermaidCode: "sequenceDiagram\\n    Client->>Server: POST /booking",
  },
});

// ============================================================================
// Mock DB & LLM
// ============================================================================

const mockSetWhere = jest.fn().mockResolvedValue(undefined);
const mockSet = jest.fn().mockReturnValue({ where: mockSetWhere });
const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });

const mockDb = {
  query: {
    agentDeskSessions: { findFirst: jest.fn() },
    agentDeskFiles: { findMany: jest.fn() },
  },
  update: mockUpdate,
};

const mockLlmService = {
  chatCompletion: jest.fn(),
};

describe("DiagramGeneratorService", () => {
  let service: DiagramGeneratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DiagramGeneratorService(mockDb as any, mockLlmService as any);
  });

  // =========================================================================
  // getCachedDiagrams
  // =========================================================================
  describe("getCachedDiagrams", () => {
    it("캐시된 다이어그램이 있으면 결과를 반환한다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSessionWithDiagrams);

      const result = await service.getCachedDiagrams(mockSessionId);

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe(mockSessionId);
      expect(result!.diagrams).toHaveLength(1);
      expect(result!.diagrams[0]!.type).toBe("flowchart");
      expect(result!.summary).toBe("캐시된 다이어그램 요약");
    });

    it("캐시된 다이어그램이 없으면 null을 반환한다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);

      const result = await service.getCachedDiagrams(mockSessionId);

      expect(result).toBeNull();
    });

    it("세션이 없으면 BadRequestException을 던진다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(null);

      await expect(service.getCachedDiagrams(mockSessionId)).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // generateDiagrams
  // =========================================================================
  describe("generateDiagrams", () => {
    it("문서 컨텍스트 기반으로 다이어그램을 생성한다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue(mockParsedFiles);
      mockLlmService.chatCompletion.mockResolvedValue(mockDiagramsResponse);

      const result = await service.generateDiagrams(mockSessionId);

      expect(result.sessionId).toBe(mockSessionId);
      expect(result.diagrams).toHaveLength(2);
      expect(result.diagrams[0]!.type).toBe("flowchart");
      expect(result.diagrams[1]!.type).toBe("er");
      expect(result.summary).toContain("프로세스 흐름");
    });

    it("세션 제목, 프롬프트, 파일 컨텍스트를 LLM에 전달한다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue(mockParsedFiles);
      mockLlmService.chatCompletion.mockResolvedValue(mockDiagramsResponse);

      await service.generateDiagrams(mockSessionId);

      const chatMessages = mockLlmService.chatCompletion.mock.calls[0]![0];
      const userMessage = chatMessages.find((m: any) => m.role === "user");
      expect(userMessage.content).toContain("예약 서비스 분석");
      expect(userMessage.content).toContain("온라인 예약 시스템");
      expect(userMessage.content).toContain("요구사항.pdf");
    });

    it("모델을 지정하면 해당 모델로 LLM을 호출한다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue(mockDiagramsResponse);

      await service.generateDiagrams(mockSessionId, "gpt-4o");

      const options = mockLlmService.chatCompletion.mock.calls[0]![1];
      expect(options).toEqual({ model: "gpt-4o", jsonMode: true });
    });

    it("모델 미지정 시 jsonMode만 전달한다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue(mockDiagramsResponse);

      await service.generateDiagrams(mockSessionId);

      const options = mockLlmService.chatCompletion.mock.calls[0]![1];
      expect(options).toEqual({ jsonMode: true });
    });

    it("생성된 다이어그램을 세션에 캐시한다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue(mockDiagramsResponse);

      await service.generateDiagrams(mockSessionId);

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          diagrams: expect.objectContaining({
            diagrams: expect.arrayContaining([
              expect.objectContaining({ type: "flowchart" }),
              expect.objectContaining({ type: "er" }),
            ]),
            summary: expect.any(String),
          }),
        }),
      );
      expect(mockSetWhere).toHaveBeenCalled();
    });

    it("세션이 없으면 BadRequestException을 던진다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(null);

      await expect(service.generateDiagrams(mockSessionId)).rejects.toThrow(BadRequestException);
    });

    it("세션에 콘텐츠가 없으면 BadRequestException을 던진다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSessionMinimal);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);

      await expect(service.generateDiagrams(mockSessionId)).rejects.toThrow(BadRequestException);
    });

    it("LLM이 JSON이 아닌 응답을 반환하면 BadRequestException을 던진다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue("분석을 완료했습니다.");

      await expect(service.generateDiagrams(mockSessionId)).rejects.toThrow(BadRequestException);
    });

    it("LLM 응답에 필수 키가 없으면 BadRequestException을 던진다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue(JSON.stringify({ diagrams: [] }));

      await expect(service.generateDiagrams(mockSessionId)).rejects.toThrow(
        /missing required field: summary/i,
      );
    });

    it("LLM 응답이 잘못된 JSON이면 BadRequestException을 던진다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue("{invalid json}");

      await expect(service.generateDiagrams(mockSessionId)).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // generateSingleDiagram
  // =========================================================================
  describe("generateSingleDiagram", () => {
    it("지정된 유형의 다이어그램을 생성한다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue(mockSingleDiagramResponse);

      const result = await service.generateSingleDiagram(mockSessionId, "sequence");

      expect(result.type).toBe("sequence");
      expect(result.title).toBe("API 호출 흐름");
      expect(result.mermaidCode).toContain("sequenceDiagram");
    });

    it("다이어그램 유형을 LLM 프롬프트에 포함한다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue(mockSingleDiagramResponse);

      await service.generateSingleDiagram(mockSessionId, "er");

      const chatMessages = mockLlmService.chatCompletion.mock.calls[0]![0];
      const userMessage = chatMessages.find((m: any) => m.role === "user");
      expect(userMessage.content).toContain("다이어그램 유형: er");
    });

    it("LLM 응답에 diagram 키가 없으면 BadRequestException을 던진다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue(JSON.stringify({ result: {} }));

      await expect(service.generateSingleDiagram(mockSessionId, "flowchart")).rejects.toThrow(
        /missing required field: diagram/i,
      );
    });
  });

  // =========================================================================
  // generateFromAnalysis
  // =========================================================================
  describe("generateFromAnalysis", () => {
    it("분석 결과 기반으로 다이어그램을 생성한다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue(mockDiagramsResponse);

      const result = await service.generateFromAnalysis(mockSessionId);

      expect(result.sessionId).toBe(mockSessionId);
      expect(result.diagrams).toHaveLength(2);
      expect(result.summary).toBeDefined();
    });

    it("분석 결과의 Feature 정보를 LLM에 전달한다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue(mockDiagramsResponse);

      await service.generateFromAnalysis(mockSessionId);

      const chatMessages = mockLlmService.chatCompletion.mock.calls[0]![0];
      const userMessage = chatMessages.find((m: any) => m.role === "user");
      expect(userMessage.content).toContain("booking");
      expect(userMessage.content).toContain("예약 관리");
      expect(userMessage.content).toContain("캘린더 UI");
    });

    it("파일 컨텍스트가 있으면 분석 결과와 함께 전달한다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue(mockParsedFiles);
      mockLlmService.chatCompletion.mockResolvedValue(mockDiagramsResponse);

      await service.generateFromAnalysis(mockSessionId);

      const chatMessages = mockLlmService.chatCompletion.mock.calls[0]![0];
      const userMessage = chatMessages.find((m: any) => m.role === "user");
      expect(userMessage.content).toContain("원본 문서");
      expect(userMessage.content).toContain("요구사항.pdf");
    });

    it("생성된 다이어그램을 세션에 캐시한다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue(mockDiagramsResponse);

      await service.generateFromAnalysis(mockSessionId);

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          diagrams: expect.objectContaining({
            diagrams: expect.any(Array),
            summary: expect.any(String),
          }),
        }),
      );
    });

    it("세션이 없으면 BadRequestException을 던진다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(null);

      await expect(service.generateFromAnalysis(mockSessionId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("분석 결과가 없으면 BadRequestException을 던진다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSessionNoAnalysis);

      await expect(service.generateFromAnalysis(mockSessionId)).rejects.toThrow(/analysis result/i);
    });

    it("모델을 지정하면 해당 모델로 호출한다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([]);
      mockLlmService.chatCompletion.mockResolvedValue(mockDiagramsResponse);

      await service.generateFromAnalysis(mockSessionId, "claude-3");

      const options = mockLlmService.chatCompletion.mock.calls[0]![1];
      expect(options).toEqual({ model: "claude-3", jsonMode: true });
    });
  });
});
