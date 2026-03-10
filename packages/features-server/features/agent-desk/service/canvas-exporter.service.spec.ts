import { BadRequestException } from "@nestjs/common";
import type { DiagramGenerationResult, DiagramResult } from "../types";
import { CanvasExporterService } from "./canvas-exporter.service";

jest.mock("@/core/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

// ============================================================================
// Mock data
// ============================================================================

const mockSessionId = "223e4567-e89b-12d3-a456-426614174001";

const mockDiagram1: DiagramResult = {
  type: "flowchart",
  title: "예약 프로세스",
  description: "예약 흐름 다이어그램",
  mermaidCode: "graph TD\\n    A[시작] --> B[예약]",
};

const mockDiagram2: DiagramResult = {
  type: "er",
  title: "데이터 모델",
  description: "엔티티 관계도",
  mermaidCode: "erDiagram\\n    USER ||--o{ BOOKING : makes",
};

const mockGenerationResult: DiagramGenerationResult = {
  sessionId: mockSessionId,
  diagrams: [mockDiagram1, mockDiagram2],
  summary: "예약 시스템의 프로세스 흐름과 데이터 모델",
};

describe("CanvasExporterService", () => {
  let service: CanvasExporterService;

  beforeEach(() => {
    service = new CanvasExporterService();
  });

  // =========================================================================
  // exportToCanvas
  // =========================================================================
  describe("exportToCanvas", () => {
    it("다이어그램을 Canvas JSON으로 변환한다", () => {
      const result = service.exportToCanvas(mockGenerationResult, "테스트 캔버스");

      expect(result.sessionId).toBe(mockSessionId);
      expect(result.canvasJson.nodes.length).toBeGreaterThan(0);
      expect(result.canvasJson.edges.length).toBeGreaterThan(0);
      expect(result.fileName).toContain(".canvas");
    });

    it("제목 노드와 요약 노드를 생성한다", () => {
      const result = service.exportToCanvas(mockGenerationResult);

      const titleNode = result.canvasJson.nodes.find((n) => n.id === "title");
      const summaryNode = result.canvasJson.nodes.find((n) => n.id === "summary");

      expect(titleNode).toBeDefined();
      expect(titleNode!.text).toBe("문서 분석 다이어그램");
      expect(summaryNode).toBeDefined();
      expect(summaryNode!.text).toContain("분석 요약");
      expect(summaryNode!.text).toContain("프로세스 흐름");
    });

    it("커스텀 제목이 제목 노드에 반영된다", () => {
      const result = service.exportToCanvas(mockGenerationResult, "내 다이어그램");

      const titleNode = result.canvasJson.nodes.find((n) => n.id === "title");
      expect(titleNode!.text).toBe("내 다이어그램");
    });

    it("다이어그램별로 설명+코드+그룹 노드를 생성한다", () => {
      const result = service.exportToCanvas(mockGenerationResult);

      // 2개 다이어그램 → 각각 desc, diagram, group 노드 (6개) + title + summary (2개) = 8개
      expect(result.canvasJson.nodes).toHaveLength(8);

      const group0 = result.canvasJson.nodes.find((n) => n.id === "group-0");
      const group1 = result.canvasJson.nodes.find((n) => n.id === "group-1");
      expect(group0).toBeDefined();
      expect(group0!.type).toBe("group");
      expect(group0!.label).toBe("예약 프로세스");
      expect(group1!.label).toBe("데이터 모델");
    });

    it("Mermaid 코드를 코드 블록으로 포맷팅한다", () => {
      const result = service.exportToCanvas(mockGenerationResult);

      const diagramNode = result.canvasJson.nodes.find((n) => n.id === "diagram-0");
      expect(diagramNode).toBeDefined();
      expect(diagramNode!.text).toContain("```mermaid");
      expect(diagramNode!.text).toContain("graph TD");
    });

    it("다이어그램 유형별로 색상을 매핑한다", () => {
      const result = service.exportToCanvas(mockGenerationResult);

      const flowchartGroup = result.canvasJson.nodes.find((n) => n.id === "group-0");
      const erGroup = result.canvasJson.nodes.find((n) => n.id === "group-1");

      expect(flowchartGroup!.color).toBe("2"); // green
      expect(erGroup!.color).toBe("4"); // pink
    });

    it("제목→요약, 요약→첫 그룹, 그룹 간 순차 엣지를 생성한다", () => {
      const result = service.exportToCanvas(mockGenerationResult);
      const edges = result.canvasJson.edges;

      const titleToSummary = edges.find((e) => e.id === "title-to-summary");
      expect(titleToSummary).toBeDefined();
      expect(titleToSummary!.fromNode).toBe("title");
      expect(titleToSummary!.toNode).toBe("summary");

      const summaryToFirst = edges.find((e) => e.id === "summary-to-first");
      expect(summaryToFirst).toBeDefined();
      expect(summaryToFirst!.toNode).toBe("group-0");

      const groupLink = edges.find((e) => e.id === "group-0-to-1");
      expect(groupLink).toBeDefined();
      expect(groupLink!.fromNode).toBe("group-0");
      expect(groupLink!.toNode).toBe("group-1");
    });

    it("파일명에 날짜, 제목, 세션 ID가 포함된다", () => {
      const result = service.exportToCanvas(mockGenerationResult, "My Canvas");

      expect(result.fileName).toMatch(/^\d{4}-\d{2}-\d{2}-My-Canvas-/);
      expect(result.fileName.endsWith(".canvas")).toBe(true);
    });

    it("다이어그램이 없으면 BadRequestException을 던진다", () => {
      const emptyResult: DiagramGenerationResult = {
        sessionId: mockSessionId,
        diagrams: [],
        summary: "없음",
      };

      expect(() => service.exportToCanvas(emptyResult)).toThrow(BadRequestException);
    });

    it("다이어그램 배열이 null이면 BadRequestException을 던진다", () => {
      const nullResult = {
        sessionId: mockSessionId,
        diagrams: null as any,
        summary: "없음",
      };

      expect(() => service.exportToCanvas(nullResult)).toThrow(BadRequestException);
    });

    it("단일 다이어그램으로도 정상 동작한다", () => {
      const singleResult: DiagramGenerationResult = {
        sessionId: mockSessionId,
        diagrams: [mockDiagram1],
        summary: "단일 다이어그램",
      };

      const result = service.exportToCanvas(singleResult);

      // title + summary + desc-0 + diagram-0 + group-0 = 5
      expect(result.canvasJson.nodes).toHaveLength(5);
      // 첫 그룹에는 그룹 간 순차 엣지가 없음
      const groupLinks = result.canvasJson.edges.filter((e) => e.id.startsWith("group-"));
      expect(groupLinks).toHaveLength(0);
    });
  });

  // =========================================================================
  // exportSingleDiagramToCanvas
  // =========================================================================
  describe("exportSingleDiagramToCanvas", () => {
    it("단일 다이어그램을 Canvas로 변환한다", () => {
      const result = service.exportSingleDiagramToCanvas(mockSessionId, mockDiagram1);

      expect(result.sessionId).toBe(mockSessionId);
      expect(result.canvasJson.nodes.length).toBeGreaterThan(0);
      expect(result.fileName).toContain(".canvas");
    });

    it("다이어그램 제목을 Canvas 제목으로 사용한다", () => {
      const result = service.exportSingleDiagramToCanvas(mockSessionId, mockDiagram1);

      const titleNode = result.canvasJson.nodes.find((n) => n.id === "title");
      expect(titleNode!.text).toBe("예약 프로세스");
    });

    it("다이어그램 설명을 요약으로 사용한다", () => {
      const result = service.exportSingleDiagramToCanvas(mockSessionId, mockDiagram1);

      const summaryNode = result.canvasJson.nodes.find((n) => n.id === "summary");
      expect(summaryNode!.text).toContain("예약 흐름 다이어그램");
    });
  });

  // =========================================================================
  // Color mapping
  // =========================================================================
  describe("getDiagramColor (via exportToCanvas)", () => {
    const diagramTypes = [
      { type: "flowchart", expectedColor: "2" },
      { type: "sequence", expectedColor: "3" },
      { type: "er", expectedColor: "4" },
      { type: "mindmap", expectedColor: "5" },
      { type: "classDiagram", expectedColor: "6" },
      { type: "stateDiagram", expectedColor: "1" },
    ];

    it.each(diagramTypes)(
      "$type 유형은 색상 $expectedColor을 갖는다",
      ({ type, expectedColor }) => {
        const result = service.exportToCanvas({
          sessionId: mockSessionId,
          diagrams: [{ ...mockDiagram1, type: type as any }],
          summary: "test",
        });

        const groupNode = result.canvasJson.nodes.find((n) => n.id === "group-0");
        expect(groupNode!.color).toBe(expectedColor);
      },
    );

    it("알 수 없는 유형은 기본 색상 0을 갖는다", () => {
      const result = service.exportToCanvas({
        sessionId: mockSessionId,
        diagrams: [{ ...mockDiagram1, type: "unknown" as any }],
        summary: "test",
      });

      const groupNode = result.canvasJson.nodes.find((n) => n.id === "group-0");
      expect(groupNode!.color).toBe("0");
    });
  });
});
