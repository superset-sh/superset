import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { RequirementSourceService } from "./requirement-source.service";

// Mock Drizzle ORM functions
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
  desc: jest.fn((field: any) => ({ field, type: "desc" })),
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
    priority: { name: "priority" },
    trustScore: { name: "trust_score" },
    parseStatus: { name: "parse_status" },
    fileId: { name: "file_id" },
    metadata: { name: "metadata" },
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

// =========================================================================
// Mock Data
// =========================================================================

const mockUserId = "123e4567-e89b-12d3-a456-426614174000";
const mockOtherUserId = "999e4567-e89b-12d3-a456-426614174999";
const mockSessionId = "223e4567-e89b-12d3-a456-426614174001";
const mockSourceId = "323e4567-e89b-12d3-a456-426614174002";
const mockFileId = "423e4567-e89b-12d3-a456-426614174003";

const mockSession = {
  id: mockSessionId,
  type: "customer" as const,
  status: "chatting" as const,
  title: "테스트 세션",
  createdById: mockUserId,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSource = {
  id: mockSourceId,
  sessionId: mockSessionId,
  sourceType: "manual" as const,
  title: "수동 입력 요구사항",
  rawContent: "사용자 로그인 기능이 필요합니다",
  parsedContent: "사용자 로그인 기능이 필요합니다",
  priority: 3,
  trustScore: 100,
  parseStatus: "parsed" as const,
  fileId: null,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockFileSource = {
  id: "523e4567-e89b-12d3-a456-426614174004",
  sessionId: mockSessionId,
  sourceType: "pdf" as const,
  title: "기획서.pdf",
  rawContent: null,
  parsedContent: null,
  priority: 3,
  trustScore: 100,
  parseStatus: "pending" as const,
  fileId: mockFileId,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

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

const mockFileParserService = {
  parseFile: jest.fn(),
};

// =========================================================================
// Tests
// =========================================================================

describe("RequirementSourceService", () => {
  let service: RequirementSourceService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new RequirementSourceService(
      mockDb as any,
      mockSessionService as any,
      mockFileParserService as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // =========================================================================
  // addSource
  // =========================================================================
  describe("addSource", () => {
    it("manual 소스를 성공적으로 추가한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb._queueResolve("returning", [mockSource]);

      const result = await service.addSource(
        {
          sessionId: mockSessionId,
          sourceType: "manual",
          title: "수동 입력 요구사항",
          rawContent: "사용자 로그인 기능이 필요합니다",
        },
        mockUserId,
      );

      expect(result).toEqual(mockSource);
      expect(result.parseStatus).toBe("parsed");
      expect(result.parsedContent).toBe("사용자 로그인 기능이 필요합니다");
      expect(mockSessionService.verifySessionOwnership).toHaveBeenCalledWith(
        mockSessionId,
        mockUserId,
      );
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalled();
    });

    it("file 소스를 성공적으로 추가하고 비동기 파싱을 트리거한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb._queueResolve("returning", [mockFileSource]);
      mockFileParserService.parseFile.mockResolvedValue({
        content: "파싱된 내용",
        metadata: { pages: 5 },
      });

      const result = await service.addSource(
        {
          sessionId: mockSessionId,
          sourceType: "pdf",
          title: "기획서.pdf",
          fileId: mockFileId,
        },
        mockUserId,
      );

      expect(result).toEqual(mockFileSource);
      expect(result.parseStatus).toBe("pending");
      expect(mockSessionService.verifySessionOwnership).toHaveBeenCalled();
    });

    it("manual 타입에 rawContent 누락 시 BadRequestException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);

      await expect(
        service.addSource(
          {
            sessionId: mockSessionId,
            sourceType: "manual",
            title: "빈 수동 입력",
            // rawContent 누락
          },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.addSource(
          {
            sessionId: mockSessionId,
            sourceType: "manual",
            title: "빈 수동 입력",
          },
          mockUserId,
        ),
      ).rejects.toThrow("manual 소스 유형에는 rawContent가 필수입니다");
    });

    it("file 타입에 fileId 누락 시 BadRequestException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);

      await expect(
        service.addSource(
          {
            sessionId: mockSessionId,
            sourceType: "pdf",
            title: "파일 없는 PDF",
            // fileId 누락
          },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.addSource(
          {
            sessionId: mockSessionId,
            sourceType: "pdf",
            title: "파일 없는 PDF",
          },
          mockUserId,
        ),
      ).rejects.toThrow("pdf 소스 유형에는 fileId가 필수입니다");
    });

    it("세션 소유권이 없으면 ForbiddenException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockRejectedValue(
        new ForbiddenException(`Not authorized to access session: ${mockSessionId}`),
      );

      await expect(
        service.addSource(
          {
            sessionId: mockSessionId,
            sourceType: "manual",
            title: "무단 접근",
            rawContent: "내용",
          },
          mockOtherUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("DB insert 실패 시 BadRequestException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb._queueResolve("returning", [undefined]);

      await expect(
        service.addSource(
          {
            sessionId: mockSessionId,
            sourceType: "manual",
            title: "실패 테스트",
            rawContent: "내용",
          },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // listSources
  // =========================================================================
  describe("listSources", () => {
    it("세션별 소스 목록을 반환한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskRequirementSources.findMany.mockResolvedValue([
        mockSource,
        mockFileSource,
      ]);

      const result = await service.listSources(mockSessionId, mockUserId);

      expect(result).toHaveLength(2);
      expect(result).toEqual([mockSource, mockFileSource]);
      expect(mockSessionService.verifySessionOwnership).toHaveBeenCalledWith(
        mockSessionId,
        mockUserId,
      );
      expect(mockDb.query.agentDeskRequirementSources.findMany).toHaveBeenCalled();
    });

    it("소스가 없으면 빈 배열을 반환한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskRequirementSources.findMany.mockResolvedValue([]);

      const result = await service.listSources(mockSessionId, mockUserId);

      expect(result).toEqual([]);
    });

    it("세션 소유권이 없으면 ForbiddenException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockRejectedValue(
        new ForbiddenException(`Not authorized to access session: ${mockSessionId}`),
      );

      await expect(
        service.listSources(mockSessionId, mockOtherUserId),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
