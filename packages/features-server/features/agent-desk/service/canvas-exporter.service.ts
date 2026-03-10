import { Injectable, BadRequestException } from "@nestjs/common";
import { createLogger } from "../../../core/logger";
import type {
  DiagramResult,
  DiagramGenerationResult,
  CanvasNode,
  CanvasEdge,
  CanvasData,
  CanvasExportResult,
} from "../types";

const logger = createLogger("agent-desk");

/** Canvas 노드 간 기본 간격 */
const NODE_GAP_X = 60;
const NODE_GAP_Y = 80;

/** 다이어그램 노드 기본 크기 */
const DIAGRAM_NODE_WIDTH = 600;
const DIAGRAM_NODE_HEIGHT = 400;

/** 텍스트 노드 기본 크기 */
const TEXT_NODE_WIDTH = 400;
const TEXT_NODE_HEIGHT = 200;

/** 그룹 노드 패딩 */
const GROUP_PADDING = 40;

@Injectable()
export class CanvasExporterService {
  /**
   * DiagramGenerationResult를 Obsidian Canvas JSON으로 변환
   */
  exportToCanvas(
    result: DiagramGenerationResult,
    title?: string,
  ): CanvasExportResult {
    if (!result.diagrams || result.diagrams.length === 0) {
      throw new BadRequestException("No diagrams to export");
    }

    const nodes: CanvasNode[] = [];
    const edges: CanvasEdge[] = [];

    // 1. 제목 노드
    const titleNode = this.createTextNode(
      "title",
      title ?? "문서 분석 다이어그램",
      0,
      0,
      TEXT_NODE_WIDTH,
      100,
      "1",
    );
    nodes.push(titleNode);

    // 2. 요약 노드
    const summaryNode = this.createTextNode(
      "summary",
      `## 분석 요약\n\n${result.summary}`,
      TEXT_NODE_WIDTH + NODE_GAP_X,
      0,
      TEXT_NODE_WIDTH,
      TEXT_NODE_HEIGHT,
    );
    nodes.push(summaryNode);

    // 제목 → 요약 연결
    edges.push(
      this.createEdge("title-to-summary", "title", "summary", "right", "left"),
    );

    // 3. 다이어그램 노드들 (2열 그리드 배치)
    const startY = Math.max(titleNode.height, summaryNode.height) + NODE_GAP_Y;
    const columns = 2;

    result.diagrams.forEach((diagram, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);

      const x = col * (DIAGRAM_NODE_WIDTH + NODE_GAP_X);
      const y = startY + row * (DIAGRAM_NODE_HEIGHT + TEXT_NODE_HEIGHT + NODE_GAP_Y * 2);

      const diagramId = `diagram-${index}`;
      const descId = `desc-${index}`;
      const groupId = `group-${index}`;

      // 다이어그램 설명 노드
      const descNode = this.createTextNode(
        descId,
        `### ${diagram.title}\n\n${diagram.description}\n\n**유형**: ${diagram.type}`,
        x + GROUP_PADDING,
        y + GROUP_PADDING,
        DIAGRAM_NODE_WIDTH - GROUP_PADDING * 2,
        120,
      );
      nodes.push(descNode);

      // Mermaid 다이어그램 노드 (코드 블록으로)
      const mermaidNode = this.createTextNode(
        diagramId,
        this.formatMermaidForCanvas(diagram),
        x + GROUP_PADDING,
        y + 120 + GROUP_PADDING + 20,
        DIAGRAM_NODE_WIDTH - GROUP_PADDING * 2,
        DIAGRAM_NODE_HEIGHT - 120 - 40,
      );
      nodes.push(mermaidNode);

      // 그룹 노드 (설명 + 다이어그램을 감싸기)
      const groupNode: CanvasNode = {
        id: groupId,
        type: "group",
        x,
        y,
        width: DIAGRAM_NODE_WIDTH,
        height: DIAGRAM_NODE_HEIGHT + TEXT_NODE_HEIGHT,
        label: diagram.title,
        color: this.getDiagramColor(diagram.type),
      };
      nodes.push(groupNode);

      // 설명 → 다이어그램 연결
      edges.push(
        this.createEdge(
          `desc-to-diagram-${index}`,
          descId,
          diagramId,
          "bottom",
          "top",
        ),
      );

      // 요약 → 첫 번째 그룹 연결
      if (index === 0) {
        edges.push(
          this.createEdge(
            "summary-to-first",
            "summary",
            groupId,
            "bottom",
            "top",
          ),
        );
      }

      // 그룹 간 순차 연결
      if (index > 0) {
        const prevGroupId = `group-${index - 1}`;
        edges.push(
          this.createEdge(
            `group-${index - 1}-to-${index}`,
            prevGroupId,
            groupId,
            "right",
            "left",
            `${index}`,
          ),
        );
      }
    });

    const canvasJson: CanvasData = { nodes, edges };

    const fileName = this.generateCanvasFileName(
      title ?? "analysis-diagrams",
      result.sessionId,
    );

    logger.info("Canvas exported", {
      "agent_desk.session_id": result.sessionId,
      "agent_desk.canvas_nodes": nodes.length,
      "agent_desk.canvas_edges": edges.length,
    });

    return {
      sessionId: result.sessionId,
      canvasJson,
      fileName,
    };
  }

  /**
   * 단일 다이어그램을 Canvas JSON으로 변환
   */
  exportSingleDiagramToCanvas(
    sessionId: string,
    diagram: DiagramResult,
  ): CanvasExportResult {
    const result: DiagramGenerationResult = {
      sessionId,
      diagrams: [diagram],
      summary: diagram.description,
    };
    return this.exportToCanvas(result, diagram.title);
  }

  /**
   * Mermaid 코드를 Canvas 텍스트 노드용으로 포맷팅
   */
  private formatMermaidForCanvas(diagram: DiagramResult): string {
    const mermaidCode = diagram.mermaidCode
      .replace(/\\n/g, "\n")
      .trim();

    return `\`\`\`mermaid\n${mermaidCode}\n\`\`\``;
  }

  /**
   * 텍스트 노드 생성 헬퍼
   */
  private createTextNode(
    id: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color?: string,
  ): CanvasNode {
    return { id, type: "text", x, y, width, height, text, color };
  }

  /**
   * 엣지 생성 헬퍼
   */
  private createEdge(
    id: string,
    fromNode: string,
    toNode: string,
    fromSide: CanvasEdge["fromSide"],
    toSide: CanvasEdge["toSide"],
    label?: string,
  ): CanvasEdge {
    return { id, fromNode, toNode, fromSide, toSide, label };
  }

  /**
   * 다이어그램 유형별 색상 매핑
   */
  private getDiagramColor(type: string): string {
    const colors: Record<string, string> = {
      flowchart: "2",     // green
      sequence: "3",      // purple
      er: "4",            // pink
      mindmap: "5",       // cyan
      classDiagram: "6",  // yellow
      stateDiagram: "1",  // red
    };
    return colors[type] ?? "0";
  }

  /**
   * Canvas 파일명 생성
   */
  private generateCanvasFileName(title: string, sessionId: string): string {
    const safeName = title
      .replace(/[^a-zA-Z0-9가-힣\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 50);

    const timestamp = new Date().toISOString().slice(0, 10);
    return `${timestamp}-${safeName}-${sessionId.slice(0, 8)}.canvas`;
  }
}
