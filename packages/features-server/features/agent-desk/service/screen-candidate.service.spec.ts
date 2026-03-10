import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ScreenCandidateService } from "./screen-candidate.service";

// Mock Drizzle ORM functions
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
}));

// Mock schema tables
jest.mock("@superbuilder/drizzle", () => ({
  DRIZZLE: "DRIZZLE_TOKEN",
  InjectDrizzle: () => () => undefined,
  agentDeskSessions: {
    id: { name: "id" },
    type: { name: "type" },
    status: { name: "status" },
    title: { name: "title" },
    flowData: { name: "flow_data" },
    createdById: { name: "created_by_id" },
    createdAt: { name: "created_at" },
    updatedAt: { name: "updated_at" },
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
const mockScreenId = "323e4567-e89b-12d3-a456-426614174002";
const mockEdgeId = "423e4567-e89b-12d3-a456-426614174003";
const mockRequirementId = "523e4567-e89b-12d3-a456-426614174004";

const mockSession = {
  id: mockSessionId,
  type: "customer" as const,
  status: "chatting" as const,
  title: "테스트 세션",
  createdById: mockUserId,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockFlowData = {
  screens: [
    {
      id: mockScreenId,
      name: "로그인",
      order: 0,
      description: "로그인 화면",
      wireframeType: "form",
      wireframeMermaid: "",
      nextScreenIds: [],
      metadata: {},
      detail: { screenGoal: "사용자 인증" },
    },
  ],
  currentScreenIndex: 0,
  edges: [
    {
      id: mockEdgeId,
      fromScreenId: mockScreenId,
      toScreenId: "target-id",
      conditionLabel: "로그인 성공",
      transitionType: "navigate" as const,
      sourceRequirementIds: [],
    },
  ],
};

const mockSessionWithFlowData = {
  id: mockSessionId,
  flowData: mockFlowData,
};

const mockNormalizedRequirement = {
  id: mockRequirementId,
  sessionId: mockSessionId,
  category: "feature" as const,
  summary: "사용자 로그인 기능",
  detail: "이메일/비밀번호 기반 로그인",
  sourceIds: ["source-1"],
  confidence: 90,
  conflictStatus: "none" as const,
  dedupeGroupId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockLlmResponse = JSON.stringify({
  screens: [
    {
      id: "new-screen-id",
      name: "대시보드",
      description: "메인 대시보드",
      wireframeType: "dashboard",
      detail: { screenGoal: "데이터 요약", keyElements: ["차트", "통계"] },
    },
  ],
  edges: [
    {
      id: "new-edge-id",
      fromScreenId: "new-screen-id",
      toScreenId: "another-id",
      conditionLabel: "메뉴 클릭",
      transitionType: "navigate",
      sourceRequirementIds: [mockRequirementId],
    },
  ],
  flowchartMermaid: "graph TD\n  A[대시보드] --> B[상세]",
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
      agentDeskSessions: {
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

describe("ScreenCandidateService", () => {
  let service: ScreenCandidateService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new ScreenCandidateService(
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
  // generateCandidates
  // =========================================================================
  describe("generateCandidates", () => {
    it("요구사항을 기반으로 화면 후보를 생성한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskNormalizedRequirements.findMany.mockResolvedValue([
        mockNormalizedRequirement,
      ]);
      mockLlmService.chatCompletion.mockResolvedValue(mockLlmResponse);
      // db.update().set().where() for saving flowData
      mockDb._queueResolve("where", undefined);

      const result = await service.generateCandidates(
        { sessionId: mockSessionId },
        mockUserId,
      );

      expect(result.screens).toHaveLength(1);
      expect(result.screens[0]!.name).toBe("대시보드");
      expect(result.screens[0]!.order).toBe(0);
      expect(result.screens[0]!.wireframeMermaid).toBe("");
      expect(result.screens[0]!.nextScreenIds).toEqual(["another-id"]);
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]!.conditionLabel).toBe("메뉴 클릭");
      expect(result.flowchartMermaid).toBe("graph TD\n  A[대시보드] --> B[상세]");
      expect(mockSessionService.verifySessionOwnership).toHaveBeenCalledWith(
        mockSessionId,
        mockUserId,
      );
      expect(mockLlmService.chatCompletion).toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("model 옵션을 LLM에 전달한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskNormalizedRequirements.findMany.mockResolvedValue([
        mockNormalizedRequirement,
      ]);
      mockLlmService.chatCompletion.mockResolvedValue(mockLlmResponse);
      mockDb._queueResolve("where", undefined);

      await service.generateCandidates(
        { sessionId: mockSessionId, model: "gpt-4o" },
        mockUserId,
      );

      expect(mockLlmService.chatCompletion).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ model: "gpt-4o", jsonMode: true }),
      );
    });

    it("model 옵션이 없으면 jsonMode만 전달한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskNormalizedRequirements.findMany.mockResolvedValue([
        mockNormalizedRequirement,
      ]);
      mockLlmService.chatCompletion.mockResolvedValue(mockLlmResponse);
      mockDb._queueResolve("where", undefined);

      await service.generateCandidates(
        { sessionId: mockSessionId },
        mockUserId,
      );

      expect(mockLlmService.chatCompletion).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ jsonMode: true }),
      );
    });

    it("정규화된 요구사항이 없으면 BadRequestException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskNormalizedRequirements.findMany.mockResolvedValue([]);

      await expect(
        service.generateCandidates({ sessionId: mockSessionId }, mockUserId),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.generateCandidates({ sessionId: mockSessionId }, mockUserId),
      ).rejects.toThrow("정규화된 요구사항이 없습니다");

      expect(mockLlmService.chatCompletion).not.toHaveBeenCalled();
    });

    it("LLM 응답에서 JSON을 추출할 수 없으면 BadRequestException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskNormalizedRequirements.findMany.mockResolvedValue([
        mockNormalizedRequirement,
      ]);
      mockLlmService.chatCompletion.mockResolvedValue("유효하지 않은 텍스트 응답입니다");

      await expect(
        service.generateCandidates({ sessionId: mockSessionId }, mockUserId),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.generateCandidates({ sessionId: mockSessionId }, mockUserId),
      ).rejects.toThrow("LLM 응답에서 유효한 JSON을 추출할 수 없습니다");
    });

    it("LLM 응답 JSON이 유효하지 않으면 BadRequestException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskNormalizedRequirements.findMany.mockResolvedValue([
        mockNormalizedRequirement,
      ]);
      mockLlmService.chatCompletion.mockResolvedValue("{invalid json}");

      await expect(
        service.generateCandidates({ sessionId: mockSessionId }, mockUserId),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.generateCandidates({ sessionId: mockSessionId }, mockUserId),
      ).rejects.toThrow("LLM 응답 JSON 파싱에 실패했습니다");
    });

    it("세션 소유권이 없으면 ForbiddenException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockRejectedValue(
        new ForbiddenException(`Not authorized to access session: ${mockSessionId}`),
      );

      await expect(
        service.generateCandidates({ sessionId: mockSessionId }, mockOtherUserId),
      ).rejects.toThrow(ForbiddenException);

      expect(mockLlmService.chatCompletion).not.toHaveBeenCalled();
    });

    it("edges가 없는 화면의 nextScreenIds는 빈 배열이다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskNormalizedRequirements.findMany.mockResolvedValue([
        mockNormalizedRequirement,
      ]);
      const responseNoEdges = JSON.stringify({
        screens: [
          {
            id: "isolated-screen",
            name: "독립 화면",
            description: "엣지 없는 화면",
            wireframeType: "empty",
          },
        ],
        edges: [],
      });
      mockLlmService.chatCompletion.mockResolvedValue(responseNoEdges);
      mockDb._queueResolve("where", undefined);

      const result = await service.generateCandidates(
        { sessionId: mockSessionId },
        mockUserId,
      );

      expect(result.screens[0]!.nextScreenIds).toEqual([]);
      expect(result.edges).toHaveLength(0);
      expect(result.flowchartMermaid).toBe("");
    });
  });

  // =========================================================================
  // updateScreenDetail
  // =========================================================================
  describe("updateScreenDetail", () => {
    it("화면 상세 정보를 업데이트한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSessionWithFlowData);
      // db.update().set().where()
      mockDb._queueResolve("where", undefined);

      const result = await service.updateScreenDetail(
        {
          sessionId: mockSessionId,
          screenId: mockScreenId,
          screenGoal: "업데이트된 목적",
        },
        mockUserId,
      );

      expect(result.screens[0]!.detail).toEqual(
        expect.objectContaining({ screenGoal: "업데이트된 목적" }),
      );
      expect(mockSessionService.verifySessionOwnership).toHaveBeenCalledWith(
        mockSessionId,
        mockUserId,
      );
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("기존 detail 필드를 유지하면서 병합한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      // Fresh copy to avoid mutation from previous tests
      const freshSession = {
        id: mockSessionId,
        flowData: {
          screens: [
            {
              id: mockScreenId,
              name: "로그인",
              order: 0,
              description: "로그인 화면",
              wireframeType: "form",
              wireframeMermaid: "",
              nextScreenIds: [],
              metadata: {},
              detail: { screenGoal: "사용자 인증" },
            },
          ],
          currentScreenIndex: 0,
          edges: [],
        },
      };
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(freshSession);
      mockDb._queueResolve("where", undefined);

      const result = await service.updateScreenDetail(
        {
          sessionId: mockSessionId,
          screenId: mockScreenId,
          primaryUser: "관리자",
        },
        mockUserId,
      );

      // 기존 screenGoal이 유지되고 primaryUser가 추가됨
      expect(result.screens[0]!.detail).toEqual(
        expect.objectContaining({
          screenGoal: "사용자 인증",
          primaryUser: "관리자",
        }),
      );
    });

    it("세션을 찾을 수 없으면 NotFoundException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(null);

      await expect(
        service.updateScreenDetail(
          { sessionId: mockSessionId, screenId: mockScreenId },
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.updateScreenDetail(
          { sessionId: mockSessionId, screenId: mockScreenId },
          mockUserId,
        ),
      ).rejects.toThrow(`Session not found: ${mockSessionId}`);
    });

    it("존재하지 않는 screenId이면 NotFoundException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSessionWithFlowData);

      await expect(
        service.updateScreenDetail(
          { sessionId: mockSessionId, screenId: "nonexistent-screen" },
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.updateScreenDetail(
          { sessionId: mockSessionId, screenId: "nonexistent-screen" },
          mockUserId,
        ),
      ).rejects.toThrow("Screen not found: nonexistent-screen");
    });

    it("세션 소유권이 없으면 ForbiddenException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockRejectedValue(
        new ForbiddenException(`Not authorized to access session: ${mockSessionId}`),
      );

      await expect(
        service.updateScreenDetail(
          { sessionId: mockSessionId, screenId: mockScreenId },
          mockOtherUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // updateFlowEdge
  // =========================================================================
  describe("updateFlowEdge", () => {
    it("엣지의 conditionLabel을 업데이트한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSessionWithFlowData);
      mockDb._queueResolve("where", undefined);

      const result = await service.updateFlowEdge(
        {
          sessionId: mockSessionId,
          edgeId: mockEdgeId,
          conditionLabel: "업데이트된 조건",
        },
        mockUserId,
      );

      const updatedEdge = result.edges!.find((e: any) => e.id === mockEdgeId);
      expect(updatedEdge!.conditionLabel).toBe("업데이트된 조건");
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("엣지의 transitionType을 업데이트한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSessionWithFlowData);
      mockDb._queueResolve("where", undefined);

      const result = await service.updateFlowEdge(
        {
          sessionId: mockSessionId,
          edgeId: mockEdgeId,
          transitionType: "redirect",
        },
        mockUserId,
      );

      const updatedEdge = result.edges!.find((e: any) => e.id === mockEdgeId);
      expect(updatedEdge!.transitionType).toBe("redirect");
    });

    it("세션을 찾을 수 없으면 NotFoundException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(null);

      await expect(
        service.updateFlowEdge(
          { sessionId: mockSessionId, edgeId: mockEdgeId },
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.updateFlowEdge(
          { sessionId: mockSessionId, edgeId: mockEdgeId },
          mockUserId,
        ),
      ).rejects.toThrow(`Session not found: ${mockSessionId}`);
    });

    it("존재하지 않는 edgeId이면 NotFoundException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSessionWithFlowData);

      await expect(
        service.updateFlowEdge(
          { sessionId: mockSessionId, edgeId: "nonexistent-edge" },
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.updateFlowEdge(
          { sessionId: mockSessionId, edgeId: "nonexistent-edge" },
          mockUserId,
        ),
      ).rejects.toThrow("Edge not found: nonexistent-edge");
    });

    it("세션 소유권이 없으면 ForbiddenException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockRejectedValue(
        new ForbiddenException(`Not authorized to access session: ${mockSessionId}`),
      );

      await expect(
        service.updateFlowEdge(
          { sessionId: mockSessionId, edgeId: mockEdgeId },
          mockOtherUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // selectNode
  // =========================================================================
  describe("selectNode", () => {
    it("PanelState를 올바르게 반환한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);

      const result = await service.selectNode(
        { sessionId: mockSessionId, nodeId: mockScreenId, panelMode: "edit" },
        mockUserId,
      );

      expect(result).toEqual({
        selectedNodeId: mockScreenId,
        selectedEdgeId: null,
        mode: "edit",
        activeTab: "overview",
        dirty: false,
      });
      expect(mockSessionService.verifySessionOwnership).toHaveBeenCalledWith(
        mockSessionId,
        mockUserId,
      );
    });

    it("panelMode가 view이면 mode가 view이다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);

      const result = await service.selectNode(
        { sessionId: mockSessionId, nodeId: mockScreenId, panelMode: "view" },
        mockUserId,
      );

      expect(result.mode).toBe("view");
    });

    it("세션 소유권이 없으면 ForbiddenException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockRejectedValue(
        new ForbiddenException(`Not authorized to access session: ${mockSessionId}`),
      );

      await expect(
        service.selectNode(
          { sessionId: mockSessionId, nodeId: mockScreenId, panelMode: "view" },
          mockOtherUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // selectEdge
  // =========================================================================
  describe("selectEdge", () => {
    it("PanelState를 올바르게 반환한다", async () => {
      mockSessionService.verifySessionOwnership.mockResolvedValue(mockSession);

      const result = await service.selectEdge(
        { sessionId: mockSessionId, edgeId: mockEdgeId, panelMode: "view" as const },
        mockUserId,
      );

      expect(result).toEqual({
        selectedNodeId: null,
        selectedEdgeId: mockEdgeId,
        mode: "view",
        activeTab: "transition",
        dirty: false,
      });
      expect(mockSessionService.verifySessionOwnership).toHaveBeenCalledWith(
        mockSessionId,
        mockUserId,
      );
    });

    it("세션 소유권이 없으면 ForbiddenException을 던진다", async () => {
      mockSessionService.verifySessionOwnership.mockRejectedValue(
        new ForbiddenException(`Not authorized to access session: ${mockSessionId}`),
      );

      await expect(
        service.selectEdge(
          { sessionId: mockSessionId, edgeId: mockEdgeId, panelMode: "view" as const },
          mockOtherUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
