jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: "and" })),
  desc: jest.fn((field: any) => ({ field, type: "desc" })),
  asc: jest.fn((field: any) => ({ field, type: "asc" })),
  count: jest.fn(() => ({ type: "count" })),
}));

jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = jest.requireActual("@nestjs/common");
  const col = (name: string) => ({ name });
  return {
    DRIZZLE: "DRIZZLE_TOKEN",
    InjectDrizzle: () => Inject("DRIZZLE_TOKEN"),
    storyStudioGraphNodes: {
      id: col("id"),
      projectId: col("project_id"),
      chapterId: col("chapter_id"),
      type: col("type"),
      code: col("code"),
      label: col("label"),
      positionX: col("position_x"),
      positionY: col("position_y"),
      metadata: col("metadata"),
      createdAt: col("created_at"),
      updatedAt: col("updated_at"),
    },
    storyStudioGraphEdges: {
      id: col("id"),
      projectId: col("project_id"),
      chapterId: col("chapter_id"),
      sourceNodeId: col("source_node_id"),
      targetNodeId: col("target_node_id"),
      label: col("label"),
      conditions: col("conditions"),
      effects: col("effects"),
      order: col("order"),
      createdAt: col("created_at"),
      updatedAt: col("updated_at"),
    },
  };
});

jest.mock("@/core/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { Test, type TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { GraphService } from "./graph.service";
import { createMockDb, TEST_IDS } from "../../__test-utils__";

describe("GraphService", () => {
  let service: GraphService;
  let mockDb: ReturnType<typeof createMockDb>;

  const chapterId = TEST_IDS.UUID_1;
  const projectId = TEST_IDS.UUID_2;

  const mockNode = {
    id: "node-1",
    projectId,
    chapterId,
    type: "scene",
    code: "SCN_01",
    label: "시작 장면",
    positionX: 100,
    positionY: 200,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEdge = {
    id: "edge-1",
    projectId,
    chapterId,
    sourceNodeId: "node-1",
    targetNodeId: "node-2",
    label: "다음으로",
    conditions: [],
    effects: [],
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GraphService,
        { provide: "DRIZZLE_TOKEN", useValue: mockDb },
      ],
    }).compile();
    service = module.get<GraphService>(GraphService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // =========================================================================
  // getGraph
  // =========================================================================
  describe("getGraph", () => {
    it("챕터의 노드와 엣지를 반환한다", async () => {
      mockDb.query.storyStudioGraphNodes.findMany.mockResolvedValue([mockNode]);
      mockDb.query.storyStudioGraphEdges.findMany.mockResolvedValue([mockEdge]);

      const result = await service.getGraph(chapterId);

      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toHaveLength(1);
    });

    it("빈 그래프를 반환한다", async () => {
      mockDb.query.storyStudioGraphNodes.findMany.mockResolvedValue([]);
      mockDb.query.storyStudioGraphEdges.findMany.mockResolvedValue([]);

      const result = await service.getGraph(chapterId);

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });
  });

  // =========================================================================
  // createNode
  // =========================================================================
  describe("createNode", () => {
    it("그래프 노드를 생성한다", async () => {
      mockDb._queueResolve("returning", [mockNode]);

      const result = await service.createNode({
        projectId,
        chapterId,
        type: "scene",
        code: "SCN_01",
        label: "시작 장면",
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(mockNode);
    });
  });

  // =========================================================================
  // updateNode
  // =========================================================================
  describe("updateNode", () => {
    it("그래프 노드를 수정한다", async () => {
      mockDb.query.storyStudioGraphNodes.findFirst.mockResolvedValue(mockNode);
      mockDb._queueResolve("returning", [{ ...mockNode, label: "수정됨" }]);

      const result = await service.updateNode("node-1", { label: "수정됨" });

      expect(result.label).toBe("수정됨");
    });

    it("존재하지 않는 노드 수정 시 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioGraphNodes.findFirst.mockResolvedValue(null);

      await expect(
        service.updateNode("nonexistent", { label: "수정됨" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // deleteNode
  // =========================================================================
  describe("deleteNode", () => {
    it("그래프 노드를 삭제한다", async () => {
      mockDb.query.storyStudioGraphNodes.findFirst.mockResolvedValue(mockNode);

      const result = await service.deleteNode("node-1");

      expect(mockDb.delete).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it("존재하지 않는 노드 삭제 시 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioGraphNodes.findFirst.mockResolvedValue(null);

      await expect(service.deleteNode("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // createEdge
  // =========================================================================
  describe("createEdge", () => {
    it("그래프 엣지를 생성한다", async () => {
      mockDb._queueResolve("returning", [mockEdge]);

      const result = await service.createEdge({
        projectId,
        chapterId,
        sourceNodeId: "node-1",
        targetNodeId: "node-2",
        label: "다음으로",
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(mockEdge);
    });
  });

  // =========================================================================
  // updateEdge
  // =========================================================================
  describe("updateEdge", () => {
    it("그래프 엣지를 수정한다", async () => {
      mockDb.query.storyStudioGraphEdges.findFirst.mockResolvedValue(mockEdge);
      mockDb._queueResolve("returning", [
        { ...mockEdge, label: "수정된 엣지" },
      ]);

      const result = await service.updateEdge("edge-1", {
        label: "수정된 엣지",
      });

      expect(result.label).toBe("수정된 엣지");
    });

    it("존재하지 않는 엣지 수정 시 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioGraphEdges.findFirst.mockResolvedValue(null);

      await expect(
        service.updateEdge("nonexistent", { label: "수정됨" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // deleteEdge
  // =========================================================================
  describe("deleteEdge", () => {
    it("그래프 엣지를 삭제한다", async () => {
      mockDb.query.storyStudioGraphEdges.findFirst.mockResolvedValue(mockEdge);

      const result = await service.deleteEdge("edge-1");

      expect(mockDb.delete).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it("존재하지 않는 엣지 삭제 시 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioGraphEdges.findFirst.mockResolvedValue(null);

      await expect(service.deleteEdge("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // updateNodePositions
  // =========================================================================
  describe("updateNodePositions", () => {
    it("여러 노드의 위치를 일괄 업데이트한다", async () => {
      const result = await service.updateNodePositions([
        { id: "node-1", positionX: 300, positionY: 400 },
        { id: "node-2", positionX: 500, positionY: 600 },
      ]);

      expect(mockDb.update).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });
});
