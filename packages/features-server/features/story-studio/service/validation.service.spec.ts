jest.mock("@/core/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { Test, type TestingModule } from "@nestjs/testing";
import { ValidationService } from "./validation.service";
import { GraphService } from "./graph.service";
import { DialogueService } from "./dialogue.service";
import { ChapterService } from "./chapter.service";

describe("ValidationService", () => {
  let service: ValidationService;
  let graphService: jest.Mocked<GraphService>;
  let dialogueService: jest.Mocked<DialogueService>;
  let chapterService: jest.Mocked<ChapterService>;

  const makeNode = (overrides: Record<string, any> = {}) => ({
    id: "node-1",
    projectId: "project-1",
    chapterId: "ch-1",
    type: "scene",
    code: "SC01",
    label: "씬 1",
    positionX: 0,
    positionY: 0,
    metadata: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const makeEdge = (overrides: Record<string, any> = {}) => ({
    id: "edge-1",
    projectId: "project-1",
    chapterId: "ch-1",
    sourceNodeId: "node-1",
    targetNodeId: "node-2",
    label: "다음",
    order: 1,
    conditions: [],
    effects: [],
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidationService,
        {
          provide: GraphService,
          useValue: { getGraph: jest.fn() },
        },
        {
          provide: DialogueService,
          useValue: { findByNode: jest.fn() },
        },
        {
          provide: ChapterService,
          useValue: { findByProject: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ValidationService>(ValidationService);
    graphService = module.get(GraphService);
    dialogueService = module.get(DialogueService);
    chapterService = module.get(ChapterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // validateProject
  // =========================================================================
  describe("validateProject", () => {
    it("모든 챕터를 병렬로 검증하고 요약을 반환한다", async () => {
      const ch1 = { id: "ch-1", title: "1장" };
      const ch2 = { id: "ch-2", title: "2장" };
      chapterService.findByProject.mockResolvedValue([ch1, ch2] as any);

      // Valid graphs — start → scene → end
      const validGraph = {
        nodes: [
          makeNode({ id: "start", type: "start", label: "시작" }),
          makeNode({ id: "scene", type: "scene", label: "씬" }),
          makeNode({ id: "end", type: "end", label: "끝" }),
        ],
        edges: [
          makeEdge({ id: "e1", sourceNodeId: "start", targetNodeId: "scene" }),
          makeEdge({ id: "e2", sourceNodeId: "scene", targetNodeId: "end" }),
        ],
      };
      graphService.getGraph.mockResolvedValue(validGraph as any);
      dialogueService.findByNode.mockResolvedValue([{ id: "dlg" }] as any);

      const result = await service.validateProject("project-1");

      expect(result.projectId).toBe("project-1");
      expect(result.validatedAt).toBeDefined();
      expect(result.chapters).toHaveLength(2);
      expect(result.summary.isValid).toBe(true);
    });

    it("에러가 있으면 isValid=false를 반환한다", async () => {
      chapterService.findByProject.mockResolvedValue([
        { id: "ch-1", title: "1장" },
      ] as any);

      // Graph with no start node
      graphService.getGraph.mockResolvedValue({
        nodes: [makeNode({ id: "n1", type: "scene" })],
        edges: [],
      } as any);
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.validateProject("project-1");

      expect(result.summary.isValid).toBe(false);
      expect(result.summary.totalErrors).toBeGreaterThan(0);
    });

    it("빈 프로젝트(챕터 없음)를 정상 처리한다", async () => {
      chapterService.findByProject.mockResolvedValue([]);

      const result = await service.validateProject("project-1");

      expect(result.chapters).toHaveLength(0);
      expect(result.summary.isValid).toBe(true);
      expect(result.summary.totalErrors).toBe(0);
    });
  });

  // =========================================================================
  // validateChapter — V001: Start node
  // =========================================================================
  describe("V001: 시작 노드 검증", () => {
    it("시작 노드가 없으면 에러를 발생시킨다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [makeNode({ id: "n1", type: "scene" })],
        edges: [],
      } as any);
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.validateChapter("ch-1", "1장");
      const v001 = result.issues.filter((i) => i.code === "V001");

      expect(v001).toHaveLength(1);
      expect(v001[0]!.severity).toBe("error");
    });

    it("시작 노드가 여러 개이면 중복 에러를 발생시킨다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [
          makeNode({ id: "s1", type: "start", label: "시작1" }),
          makeNode({ id: "s2", type: "start", label: "시작2" }),
          makeNode({ id: "end", type: "end", label: "끝" }),
        ],
        edges: [
          makeEdge({ id: "e1", sourceNodeId: "s1", targetNodeId: "end" }),
          makeEdge({ id: "e2", sourceNodeId: "s2", targetNodeId: "end" }),
        ],
      } as any);
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.validateChapter("ch-1", "1장");
      const v001 = result.issues.filter((i) => i.code === "V001");

      expect(v001.length).toBeGreaterThanOrEqual(1);
      expect(v001[0]!.severity).toBe("error");
    });
  });

  // =========================================================================
  // validateChapter — V002: End node
  // =========================================================================
  describe("V002: 엔딩 노드 검증", () => {
    it("엔딩 노드가 없으면 경고를 발생시킨다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [
          makeNode({ id: "start", type: "start", label: "시작" }),
          makeNode({ id: "scene", type: "scene", label: "씬" }),
        ],
        edges: [
          makeEdge({ id: "e1", sourceNodeId: "start", targetNodeId: "scene" }),
        ],
      } as any);
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.validateChapter("ch-1", "1장");
      const v002 = result.issues.filter((i) => i.code === "V002");

      expect(v002).toHaveLength(1);
      expect(v002[0]!.severity).toBe("warning");
    });
  });

  // =========================================================================
  // validateChapter — V003: Dead-end
  // =========================================================================
  describe("V003: 데드엔드 검증", () => {
    it("엔딩이 아닌 노드에 나가는 간선이 없으면 에러를 발생시킨다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [
          makeNode({ id: "start", type: "start", label: "시작" }),
          makeNode({ id: "scene", type: "scene", label: "막다른 씬" }),
          makeNode({ id: "end", type: "end", label: "끝" }),
        ],
        edges: [
          makeEdge({ id: "e1", sourceNodeId: "start", targetNodeId: "scene" }),
          // scene has no outgoing edge — dead-end
        ],
      } as any);
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.validateChapter("ch-1", "1장");
      const v003 = result.issues.filter((i) => i.code === "V003");

      expect(v003).toHaveLength(1);
      expect(v003[0]!.severity).toBe("error");
      expect(v003[0]!.nodeId).toBe("scene");
    });

    it("엔딩 노드는 데드엔드로 간주하지 않는다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [
          makeNode({ id: "start", type: "start", label: "시작" }),
          makeNode({ id: "end", type: "end", label: "끝" }),
        ],
        edges: [
          makeEdge({ id: "e1", sourceNodeId: "start", targetNodeId: "end" }),
        ],
      } as any);
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.validateChapter("ch-1", "1장");
      const v003 = result.issues.filter((i) => i.code === "V003");

      expect(v003).toHaveLength(0);
    });
  });

  // =========================================================================
  // validateChapter — V004: Unreachable nodes
  // =========================================================================
  describe("V004: 도달 불가능 노드 검증", () => {
    it("시작 노드에서 도달 불가능한 노드를 경고한다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [
          makeNode({ id: "start", type: "start", label: "시작" }),
          makeNode({ id: "scene1", type: "scene", label: "씬1" }),
          makeNode({ id: "isolated", type: "scene", label: "고립된 씬" }),
          makeNode({ id: "end", type: "end", label: "끝" }),
        ],
        edges: [
          makeEdge({ id: "e1", sourceNodeId: "start", targetNodeId: "scene1" }),
          makeEdge({ id: "e2", sourceNodeId: "scene1", targetNodeId: "end" }),
          // "isolated" has no incoming edges from start
        ],
      } as any);
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.validateChapter("ch-1", "1장");
      const v004 = result.issues.filter((i) => i.code === "V004");

      expect(v004).toHaveLength(1);
      expect(v004[0]!.nodeId).toBe("isolated");
      expect(v004[0]!.severity).toBe("warning");
    });
  });

  // =========================================================================
  // validateChapter — V005: Orphan edges
  // =========================================================================
  describe("V005: 고아 간선 검증", () => {
    it("존재하지 않는 노드를 참조하는 간선에 에러를 발생시킨다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [makeNode({ id: "start", type: "start", label: "시작" })],
        edges: [
          makeEdge({ id: "e1", sourceNodeId: "start", targetNodeId: "nonexistent" }),
        ],
      } as any);
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.validateChapter("ch-1", "1장");
      const v005 = result.issues.filter((i) => i.code === "V005");

      expect(v005).toHaveLength(1);
      expect(v005[0]!.severity).toBe("error");
      expect(v005[0]!.edgeId).toBe("e1");
    });
  });

  // =========================================================================
  // validateChapter — V006: Self-loops
  // =========================================================================
  describe("V006: 자기 참조 간선 검증", () => {
    it("자기 자신을 가리키는 간선에 경고를 발생시킨다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [
          makeNode({ id: "start", type: "start", label: "시작" }),
          makeNode({ id: "scene", type: "scene", label: "반복 씬" }),
          makeNode({ id: "end", type: "end", label: "끝" }),
        ],
        edges: [
          makeEdge({ id: "e1", sourceNodeId: "start", targetNodeId: "scene" }),
          makeEdge({ id: "e-loop", sourceNodeId: "scene", targetNodeId: "scene" }),
          makeEdge({ id: "e2", sourceNodeId: "scene", targetNodeId: "end" }),
        ],
      } as any);
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.validateChapter("ch-1", "1장");
      const v006 = result.issues.filter((i) => i.code === "V006");

      expect(v006).toHaveLength(1);
      expect(v006[0]!.severity).toBe("warning");
    });
  });

  // =========================================================================
  // validateChapter — V007: Duplicate edges
  // =========================================================================
  describe("V007: 중복 간선 검증", () => {
    it("같은 source→target 쌍의 중복 간선에 경고를 발생시킨다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [
          makeNode({ id: "start", type: "start", label: "시작" }),
          makeNode({ id: "end", type: "end", label: "끝" }),
        ],
        edges: [
          makeEdge({ id: "e1", sourceNodeId: "start", targetNodeId: "end" }),
          makeEdge({ id: "e2", sourceNodeId: "start", targetNodeId: "end" }),
        ],
      } as any);
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.validateChapter("ch-1", "1장");
      const v007 = result.issues.filter((i) => i.code === "V007");

      expect(v007).toHaveLength(1);
      expect(v007[0]!.severity).toBe("warning");
    });
  });

  // =========================================================================
  // validateChapter — V008: Start node incoming edges
  // =========================================================================
  describe("V008: 시작 노드 들어오는 간선 검증", () => {
    it("시작 노드에 들어오는 간선이 있으면 경고를 발생시킨다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [
          makeNode({ id: "start", type: "start", label: "시작" }),
          makeNode({ id: "scene", type: "scene", label: "씬" }),
          makeNode({ id: "end", type: "end", label: "끝" }),
        ],
        edges: [
          makeEdge({ id: "e1", sourceNodeId: "start", targetNodeId: "scene" }),
          makeEdge({ id: "e2", sourceNodeId: "scene", targetNodeId: "end" }),
          makeEdge({ id: "e3", sourceNodeId: "scene", targetNodeId: "start" }),
        ],
      } as any);
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.validateChapter("ch-1", "1장");
      const v008 = result.issues.filter((i) => i.code === "V008");

      expect(v008).toHaveLength(1);
      expect(v008[0]!.severity).toBe("warning");
    });
  });

  // =========================================================================
  // validateChapter — V009: End node outgoing edges
  // =========================================================================
  describe("V009: 엔딩 노드 나가는 간선 검증", () => {
    it("엔딩 노드에 나가는 간선이 있으면 경고를 발생시킨다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [
          makeNode({ id: "start", type: "start", label: "시작" }),
          makeNode({ id: "end", type: "end", label: "끝" }),
          makeNode({ id: "scene", type: "scene", label: "씬" }),
        ],
        edges: [
          makeEdge({ id: "e1", sourceNodeId: "start", targetNodeId: "end" }),
          makeEdge({ id: "e2", sourceNodeId: "end", targetNodeId: "scene" }),
          makeEdge({ id: "e3", sourceNodeId: "scene", targetNodeId: "end" }),
        ],
      } as any);
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.validateChapter("ch-1", "1장");
      const v009 = result.issues.filter((i) => i.code === "V009");

      expect(v009).toHaveLength(1);
      expect(v009[0]!.severity).toBe("warning");
    });
  });

  // =========================================================================
  // validateChapter — V010: Choice node branching
  // =========================================================================
  describe("V010: 선택지 노드 분기 검증", () => {
    it("선택지 노드에 나가는 간선이 2개 미만이면 경고를 발생시킨다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [
          makeNode({ id: "start", type: "start", label: "시작" }),
          makeNode({ id: "choice", type: "choice", label: "선택" }),
          makeNode({ id: "end", type: "end", label: "끝" }),
        ],
        edges: [
          makeEdge({ id: "e1", sourceNodeId: "start", targetNodeId: "choice" }),
          makeEdge({ id: "e2", sourceNodeId: "choice", targetNodeId: "end" }),
          // Only 1 outgoing from choice — needs 2+
        ],
      } as any);
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.validateChapter("ch-1", "1장");
      const v010 = result.issues.filter((i) => i.code === "V010");

      expect(v010).toHaveLength(1);
      expect(v010[0]!.severity).toBe("warning");
    });
  });

  // =========================================================================
  // validateChapter — V011: Empty scene nodes
  // =========================================================================
  describe("V011: 빈 씬 노드 검증", () => {
    it("대사가 없는 씬/시작 노드에 info를 발생시킨다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [
          makeNode({ id: "start", type: "start", label: "시작" }),
          makeNode({ id: "scene", type: "scene", label: "빈 씬" }),
          makeNode({ id: "end", type: "end", label: "끝" }),
        ],
        edges: [
          makeEdge({ id: "e1", sourceNodeId: "start", targetNodeId: "scene" }),
          makeEdge({ id: "e2", sourceNodeId: "scene", targetNodeId: "end" }),
        ],
      } as any);
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.validateChapter("ch-1", "1장");
      const v011 = result.issues.filter((i) => i.code === "V011");

      // Both start and scene have no dialogues
      expect(v011).toHaveLength(2);
      expect(v011[0]!.severity).toBe("info");
    });

    it("대사가 있는 씬 노드에는 info를 발생시키지 않는다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [
          makeNode({ id: "start", type: "start", label: "시작" }),
          makeNode({ id: "scene", type: "scene", label: "대사 있는 씬" }),
          makeNode({ id: "end", type: "end", label: "끝" }),
        ],
        edges: [
          makeEdge({ id: "e1", sourceNodeId: "start", targetNodeId: "scene" }),
          makeEdge({ id: "e2", sourceNodeId: "scene", targetNodeId: "end" }),
        ],
      } as any);
      dialogueService.findByNode.mockResolvedValue([{ id: "dlg-1" }] as any);

      const result = await service.validateChapter("ch-1", "1장");
      const v011 = result.issues.filter((i) => i.code === "V011");

      expect(v011).toHaveLength(0);
    });
  });

  // =========================================================================
  // validateChapter — V012: Empty graph
  // =========================================================================
  describe("V012: 빈 그래프 검증", () => {
    it("노드가 없는 그래프에 info를 발생시킨다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [],
        edges: [],
      } as any);

      const result = await service.validateChapter("ch-1", "1장");
      const v012 = result.issues.filter((i) => i.code === "V012");

      expect(v012).toHaveLength(1);
      expect(v012[0]!.severity).toBe("info");
    });
  });

  // =========================================================================
  // validateChapter — Stats
  // =========================================================================
  describe("stats 계산", () => {
    it("이슈 심각도별 카운트를 올바르게 계산한다", async () => {
      // Graph with multiple issues
      graphService.getGraph.mockResolvedValue({
        nodes: [
          makeNode({ id: "scene1", type: "scene", label: "고립 씬" }),
          // No start node → V001 error
          // No end node → V002 warning
          // scene1 has no outgoing → V003 error
        ],
        edges: [],
      } as any);
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.validateChapter("ch-1", "1장");

      expect(result.stats.nodeCount).toBe(1);
      expect(result.stats.edgeCount).toBe(0);
      expect(result.stats.errorCount).toBeGreaterThan(0);
      expect(result.stats.warningCount).toBeGreaterThanOrEqual(0);
      expect(result.chapterId).toBe("ch-1");
      expect(result.chapterTitle).toBe("1장");
    });
  });

  // =========================================================================
  // validateChapter — Valid graph (no issues except info)
  // =========================================================================
  describe("정상 그래프", () => {
    it("올바른 그래프에는 에러/경고가 없다", async () => {
      graphService.getGraph.mockResolvedValue({
        nodes: [
          makeNode({ id: "start", type: "start", label: "시작" }),
          makeNode({ id: "scene1", type: "scene", label: "씬1" }),
          makeNode({ id: "choice", type: "choice", label: "선택" }),
          makeNode({ id: "scene2", type: "scene", label: "씬2" }),
          makeNode({ id: "scene3", type: "scene", label: "씬3" }),
          makeNode({ id: "end1", type: "end", label: "엔딩1" }),
          makeNode({ id: "end2", type: "end", label: "엔딩2" }),
        ],
        edges: [
          makeEdge({ id: "e1", sourceNodeId: "start", targetNodeId: "scene1" }),
          makeEdge({ id: "e2", sourceNodeId: "scene1", targetNodeId: "choice" }),
          makeEdge({ id: "e3", sourceNodeId: "choice", targetNodeId: "scene2" }),
          makeEdge({ id: "e4", sourceNodeId: "choice", targetNodeId: "scene3" }),
          makeEdge({ id: "e5", sourceNodeId: "scene2", targetNodeId: "end1" }),
          makeEdge({ id: "e6", sourceNodeId: "scene3", targetNodeId: "end2" }),
        ],
      } as any);
      dialogueService.findByNode.mockResolvedValue([{ id: "dlg" }] as any);

      const result = await service.validateChapter("ch-1", "1장");

      expect(result.stats.errorCount).toBe(0);
      expect(result.stats.warningCount).toBe(0);
    });
  });
});
