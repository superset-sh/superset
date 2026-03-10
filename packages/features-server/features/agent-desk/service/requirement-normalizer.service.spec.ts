import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { RequirementNormalizerService } from "./requirement-normalizer.service";

// Mock Drizzle ORM functions
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
}));

// Mock schema tables
jest.mock("@superbuilder/drizzle", () => ({
  DRIZZLE: "DRIZZLE_TOKEN",
  InjectDrizzle: () => () => undefined,
  agentDeskRequirementSources: {
    id: { name: "id" },
    sessionId: { name: "session_id" },
    sourceType: { name: "source_type" },
    title: { name: "title" },
    rawContent: { name: "raw_content" },
    parsedContent: { name: "parsed_content" },
    parseStatus: { name: "parse_status" },
    fileId: { name: "file_id" },
    metadata: { name: "metadata" },
    createdAt: { name: "created_at" },
  },
  agentDeskNormalizedRequirements: {
    id: { name: "id" },
    sessionId: { name: "session_id" },
    category: { name: "category" },
    summary: { name: "summary" },
    detail: { name: "detail" },
    sourceIds: { name: "source_ids" },
    confidence: { name: "confidence" },
    conflictStatus: { name: "conflict_status" },
    dedupeGroupId: { name: "dedupe_group_id" },
    createdAt: { name: "created_at" },
  },
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

// Mock LLMService module
jest.mock("@/features/ai", () => ({
  LLMService: jest.fn(),
}));

// =========================================================================
// Mock Data
// =========================================================================

const mockUserId = "123e4567-e89b-12d3-a456-426614174000";
const mockOtherUserId = "999e4567-e89b-12d3-a456-426614174999";
const mockSessionId = "223e4567-e89b-12d3-a456-426614174001";
const mockSourceId1 = "323e4567-e89b-12d3-a456-426614174002";
const mockSourceId2 = "423e4567-e89b-12d3-a456-426614174003";

const mockSession = {
  id: mockSessionId,
  type: "customer" as const,
  status: "chatting" as const,
  title: "테스트 세션",
  createdById: mockUserId,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockParsedSource1 = {
  id: mockSourceId1,
  sessionId: mockSessionId,
  sourceType: "manual" as const,
  title: "수동 요구사항",
  rawContent: "사용자 로그인 기능이 필요합니다",
  parsedContent: "사용자 로그인 기능이 필요합니다",
  parseStatus: "parsed" as const,
  fileId: null,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockParsedSource2 = {
  id: mockSourceId2,
  sessionId: mockSessionId,
  sourceType: "manual" as const,
  title: "추가 요구사항",
  rawContent: "관리자 대시보드가 필요합니다",
  parsedContent: "관리자 대시보드가 필요합니다",
  parseStatus: "parsed" as const,
  fileId: null,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPendingSource = {
  id: "523e4567-e89b-12d3-a456-426614174004",
  sessionId: mockSessionId,
  sourceType: "pdf" as const,
  title: "파싱 중인 소스",
  rawContent: null,
  parsedContent: null,
  parseStatus: "pending" as const,
  fileId: "623e4567-e89b-12d3-a456-426614174005",
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockNormalizedRequirement = {
  id: "723e4567-e89b-12d3-a456-426614174006",
  sessionId: mockSessionId,
  category: "feature" as const,
  summary: "사용자 로그인 기능",
  detail: "이메일/비밀번호 기반 로그인",
  sourceIds: [mockSourceId1],
  confidence: 90,
  conflictStatus: "none" as const,
  dedupeGroupId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockLlmResponse = JSON.stringify({
  requirements: [
    {
      category: "feature",
      summary: "사용자 로그인 기능",
      detail: "이메일/비밀번호 기반 로그인",
      sourceIds: [mockSourceId1],
      confidence: 90,
      conflictStatus: "none",
      dedupeGroupId: null,
    },
    {
      category: "feature",
      summary: "관리자 대시보드",
      detail: "통계 및 사용자 관리",
      sourceIds: [mockSourceId2],
      confidence: 85,
      conflictStatus: "none",
      dedupeGroupId: null,
    },
  ],
});

// =========================================================================
// Mock DB
// =========================================================================

const createMockDb = () => {
  const resolveQueue: any[] = [];

  const createChainable = () => {
    const chain: any = {};
    const methods = [
      "select", "from", "where", "limit", "offset", "orderBy",
      "insert", "values", "returning", "update", "set", "delete",
    ];

    methods.forEach((method) => {
      chain[method] = jest.fn().mockImplementation(() => {
        if (resolveQueue.length > 0) {
          const nextResolve = resolveQueue[0];
          if (nextResolve.method === method || nextResolve.method === "any") {
            resolveQueue.shift();
            return Promise.resolve(nextResolve.value);
          }
        }
        return chain;
      });
    });

    chain.query = {
      agentDeskRequirementSources: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      agentDeskNormalizedRequirements: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    chain._queueResolve = (method: string, value: any) => {
      resolveQueue.push({ method, value });
    };

    chain._resetQueue = () => {
      resolveQueue.length = 0;
    };

    return chain;
  };

  return createChainable();
};

// =========================================================================
// Mock Dependencies
// =========================================================================

const mockSessionService = {
  verifySessionOwnership: jest.fn(),
  findById: jest.fn(),
};

const mockLlmService = {
  chatCompletion: jest.fn(),
};

// =========================================================================
// Tests
// =========================================================================

describe("RequirementNormalizerService", () => {
  let service: RequirementNormalizerService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new RequirementNormalizerService(
      mockDb as any,
      mockSessionService as any,
      mockLlmService as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // =========================================================================
  // normalize
  // =========================================================================
  describe("normalize", () => {
    it("파싱된 소스로 정규화를 성공적으로 수행한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      // findMany로 소스 조회 — parsed + pending 혼합
      mockDb.query.agentDeskRequirementSources.findMany.mockResolvedValue([
        mockParsedSource1,
        mockParsedSource2,
        mockPendingSource,
      ]);
      // LLM 호출
      mockLlmService.chatCompletion.mockResolvedValue(mockLlmResponse);
      // 기존 정규화 결과 삭제: delete().where()
      mockDb._queueResolve("where", undefined);
      // 새 정규화 결과 삽입: insert().values()
      mockDb._queueResolve("values", undefined);

      const result = await service.normalize(
        { sessionId: mockSessionId },
        mockUserId,
      );

      expect(result.requirements).toHaveLength(2);
      expect(result.sourceCount).toBe(2); // parsed 소스만 카운트
      expect(result.requirements[0]!.category).toBe("feature");
      expect(result.requirements[0]!.summary).toBe("사용자 로그인 기능");
      expect(mockSessionService.verifySessionOwnership).toHaveBeenCalledWith(
        mockSessionId,
        mockUserId,
      );
      expect(mockLlmService.chatCompletion).toHaveBeenCalled();
      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("model 옵션을 LLM에 전달한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskRequirementSources.findMany.mockResolvedValue([mockParsedSource1]);
      mockLlmService.chatCompletion.mockResolvedValue(
        JSON.stringify({ requirements: [] }),
      );
      mockDb._queueResolve("where", undefined);

      await service.normalize(
        { sessionId: mockSessionId, model: "gpt-4o" },
        mockUserId,
      );

      expect(mockLlmService.chatCompletion).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ model: "gpt-4o", jsonMode: true }),
      );
    });

    it("파싱된 소스가 없으면 빈 결과를 반환한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      // 모든 소스가 pending 상태
      mockDb.query.agentDeskRequirementSources.findMany.mockResolvedValue([mockPendingSource]);

      const result = await service.normalize(
        { sessionId: mockSessionId },
        mockUserId,
      );

      expect(result).toEqual({ requirements: [], sourceCount: 0 });
      expect(mockLlmService.chatCompletion).not.toHaveBeenCalled();
    });

    it("소스가 아예 없으면 빈 결과를 반환한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskRequirementSources.findMany.mockResolvedValue([]);

      const result = await service.normalize(
        { sessionId: mockSessionId },
        mockUserId,
      );

      expect(result).toEqual({ requirements: [], sourceCount: 0 });
      expect(mockLlmService.chatCompletion).not.toHaveBeenCalled();
    });

    it("세션 소유권이 없으면 ForbiddenException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockRejectedValue(
        new ForbiddenException(`Not authorized to access session: ${mockSessionId}`),
      );

      await expect(
        service.normalize({ sessionId: mockSessionId }, mockOtherUserId),
      ).rejects.toThrow(ForbiddenException);

      expect(mockLlmService.chatCompletion).not.toHaveBeenCalled();
    });

    it("LLM 응답에서 JSON을 추출할 수 없으면 BadRequestException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskRequirementSources.findMany.mockResolvedValue([mockParsedSource1]);
      // JSON이 아닌 응답
      mockLlmService.chatCompletion.mockResolvedValue("유효하지 않은 텍스트 응답입니다");

      await expect(
        service.normalize({ sessionId: mockSessionId }, mockUserId),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.normalize({ sessionId: mockSessionId }, mockUserId),
      ).rejects.toThrow("LLM 응답에서 유효한 JSON을 추출할 수 없습니다");
    });

    it("LLM 응답 JSON이 유효하지 않으면 BadRequestException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskRequirementSources.findMany.mockResolvedValue([mockParsedSource1]);
      // JSON처럼 보이지만 파싱 불가
      mockLlmService.chatCompletion.mockResolvedValue("{invalid json}");

      await expect(
        service.normalize({ sessionId: mockSessionId }, mockUserId),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.normalize({ sessionId: mockSessionId }, mockUserId),
      ).rejects.toThrow("LLM 응답 JSON 파싱에 실패했습니다");
    });

    it("정규화 결과가 0건이면 insert를 호출하지 않는다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskRequirementSources.findMany.mockResolvedValue([mockParsedSource1]);
      mockLlmService.chatCompletion.mockResolvedValue(
        JSON.stringify({ requirements: [] }),
      );
      // 기존 결과 삭제
      mockDb._queueResolve("where", undefined);

      const result = await service.normalize(
        { sessionId: mockSessionId },
        mockUserId,
      );

      expect(result.requirements).toHaveLength(0);
      expect(result.sourceCount).toBe(1);
      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // listRequirements
  // =========================================================================
  describe("listRequirements", () => {
    it("세션별 요구사항 목록을 반환한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskNormalizedRequirements.findMany.mockResolvedValue([
        mockNormalizedRequirement,
      ]);

      const result = await service.listRequirements(mockSessionId, mockUserId);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockNormalizedRequirement);
      expect(mockSessionService.verifySessionOwnership).toHaveBeenCalledWith(
        mockSessionId,
        mockUserId,
      );
      expect(mockDb.query.agentDeskNormalizedRequirements.findMany).toHaveBeenCalled();
    });

    it("요구사항이 없으면 빈 배열을 반환한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskNormalizedRequirements.findMany.mockResolvedValue([]);

      const result = await service.listRequirements(mockSessionId, mockUserId);

      expect(result).toEqual([]);
    });

    it("세션 소유권이 없으면 ForbiddenException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockRejectedValue(
        new ForbiddenException(`Not authorized to access session: ${mockSessionId}`),
      );

      await expect(
        service.listRequirements(mockSessionId, mockOtherUserId),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
