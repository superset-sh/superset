/**
 * ValidationService - Graph structure validation
 *
 * Validates graph integrity per chapter: dead-ends, unreachable nodes,
 * missing start/end, orphan edges, duplicate edges, empty scenes.
 */
import { Injectable } from "@nestjs/common";
import { createLogger } from "../../../core/logger";
import { GraphService } from "./graph.service";
import { DialogueService } from "./dialogue.service";
import { ChapterService } from "./chapter.service";

const logger = createLogger("story-studio");

/* ===================================================================== */
/* Validation Types                                                       */
/* ===================================================================== */

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  nodeId?: string;
  edgeId?: string;
  chapterId: string;
}

export interface ChapterValidationResult {
  chapterId: string;
  chapterTitle: string;
  issues: ValidationIssue[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}

export interface ProjectValidationResult {
  projectId: string;
  validatedAt: string;
  chapters: ChapterValidationResult[];
  summary: {
    totalErrors: number;
    totalWarnings: number;
    totalInfo: number;
    isValid: boolean;
  };
}

/* ===================================================================== */
/* Service                                                                */
/* ===================================================================== */

@Injectable()
export class ValidationService {
  constructor(
    private readonly graphService: GraphService,
    private readonly dialogueService: DialogueService,
    private readonly chapterService: ChapterService,
  ) {}

  async validateProject(projectId: string): Promise<ProjectValidationResult> {
    const chapters = await this.chapterService.findByProject(projectId);

    const chapterResults = await Promise.all(
      chapters.map((ch) => this.validateChapter(ch.id, ch.title)),
    );

    const totalErrors = chapterResults.reduce((sum, r) => sum + r.stats.errorCount, 0);
    const totalWarnings = chapterResults.reduce((sum, r) => sum + r.stats.warningCount, 0);
    const totalInfo = chapterResults.reduce((sum, r) => sum + r.stats.infoCount, 0);

    logger.info("Project validated", {
      "story_studio.project_id": projectId,
      "story_studio.chapters_count": chapters.length,
      "story_studio.errors": totalErrors,
      "story_studio.warnings": totalWarnings,
    });

    return {
      projectId,
      validatedAt: new Date().toISOString(),
      chapters: chapterResults,
      summary: {
        totalErrors,
        totalWarnings,
        totalInfo,
        isValid: totalErrors === 0,
      },
    };
  }

  async validateChapter(
    chapterId: string,
    chapterTitle: string,
  ): Promise<ChapterValidationResult> {
    const graph = await this.graphService.getGraph(chapterId);
    const issues: ValidationIssue[] = [];

    const nodes = graph.nodes;
    const edges = graph.edges;

    // Build lookup maps
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const outgoing = new Map<string, typeof edges>();
    const incoming = new Map<string, typeof edges>();

    for (const edge of edges) {
      const out = outgoing.get(edge.sourceNodeId) ?? [];
      out.push(edge);
      outgoing.set(edge.sourceNodeId, out);

      const inc = incoming.get(edge.targetNodeId) ?? [];
      inc.push(edge);
      incoming.set(edge.targetNodeId, inc);
    }

    // V001: Must have exactly one start node
    const startNodes = nodes.filter((n) => n.type === "start");
    if (startNodes.length === 0) {
      issues.push({
        code: "V001",
        severity: "error",
        message: "시작 노드가 없습니다. 챕터에는 반드시 하나의 시작 노드가 필요합니다.",
        chapterId,
      });
    } else if (startNodes.length > 1) {
      for (const node of startNodes.slice(1)) {
        issues.push({
          code: "V001",
          severity: "error",
          message: `중복 시작 노드: "${node.label}". 챕터에는 시작 노드가 하나만 있어야 합니다.`,
          nodeId: node.id,
          chapterId,
        });
      }
    }

    // V002: Must have at least one end node
    const endNodes = nodes.filter((n) => n.type === "end");
    if (endNodes.length === 0) {
      issues.push({
        code: "V002",
        severity: "warning",
        message: "엔딩 노드가 없습니다. 스토리에 최소 하나의 엔딩이 필요합니다.",
        chapterId,
      });
    }

    // V003: Dead-end detection (non-end nodes with no outgoing edges)
    for (const node of nodes) {
      if (node.type === "end") continue;
      const out = outgoing.get(node.id) ?? [];
      if (out.length === 0) {
        issues.push({
          code: "V003",
          severity: "error",
          message: `막다른 노드: "${node.label}" (${node.type}). 엔딩 노드가 아닌데 나가는 간선이 없습니다.`,
          nodeId: node.id,
          chapterId,
        });
      }
    }

    // V004: Unreachable nodes (BFS from start)
    if (startNodes.length > 0) {
      const reachable = new Set<string>();
      const queue = [startNodes[0]!.id];
      reachable.add(startNodes[0]!.id);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = outgoing.get(current) ?? [];
        for (const edge of neighbors) {
          if (!reachable.has(edge.targetNodeId)) {
            reachable.add(edge.targetNodeId);
            queue.push(edge.targetNodeId);
          }
        }
      }

      for (const node of nodes) {
        if (!reachable.has(node.id) && node.type !== "start") {
          issues.push({
            code: "V004",
            severity: "warning",
            message: `도달 불가능한 노드: "${node.label}" (${node.type}). 시작 노드에서 접근할 수 없습니다.`,
            nodeId: node.id,
            chapterId,
          });
        }
      }
    }

    // V005: Orphan edges (reference non-existent nodes)
    for (const edge of edges) {
      if (!nodeMap.has(edge.sourceNodeId)) {
        issues.push({
          code: "V005",
          severity: "error",
          message: `고아 간선: 출발 노드(${edge.sourceNodeId})가 존재하지 않습니다.`,
          edgeId: edge.id,
          chapterId,
        });
      }
      if (!nodeMap.has(edge.targetNodeId)) {
        issues.push({
          code: "V005",
          severity: "error",
          message: `고아 간선: 도착 노드(${edge.targetNodeId})가 존재하지 않습니다.`,
          edgeId: edge.id,
          chapterId,
        });
      }
    }

    // V006: Self-loops
    for (const edge of edges) {
      if (edge.sourceNodeId === edge.targetNodeId) {
        issues.push({
          code: "V006",
          severity: "warning",
          message: `자기 참조 간선: 노드 "${nodeMap.get(edge.sourceNodeId)?.label ?? edge.sourceNodeId}"가 자기 자신을 가리킵니다.`,
          edgeId: edge.id,
          chapterId,
        });
      }
    }

    // V007: Duplicate edges (same source -> target pair)
    const edgePairs = new Set<string>();
    for (const edge of edges) {
      const pair = `${edge.sourceNodeId}->${edge.targetNodeId}`;
      if (edgePairs.has(pair)) {
        issues.push({
          code: "V007",
          severity: "warning",
          message: `중복 간선: ${nodeMap.get(edge.sourceNodeId)?.label ?? "?"} → ${nodeMap.get(edge.targetNodeId)?.label ?? "?"}`,
          edgeId: edge.id,
          chapterId,
        });
      }
      edgePairs.add(pair);
    }

    // V008: Start node should have no incoming edges
    for (const startNode of startNodes) {
      const inc = incoming.get(startNode.id) ?? [];
      if (inc.length > 0) {
        issues.push({
          code: "V008",
          severity: "warning",
          message: `시작 노드 "${startNode.label}"에 들어오는 간선이 있습니다.`,
          nodeId: startNode.id,
          chapterId,
        });
      }
    }

    // V009: End nodes should have no outgoing edges
    for (const endNode of endNodes) {
      const out = outgoing.get(endNode.id) ?? [];
      if (out.length > 0) {
        issues.push({
          code: "V009",
          severity: "warning",
          message: `엔딩 노드 "${endNode.label}"에 나가는 간선이 있습니다.`,
          nodeId: endNode.id,
          chapterId,
        });
      }
    }

    // V010: Choice nodes should have 2+ outgoing edges
    const choiceNodes = nodes.filter((n) => n.type === "choice");
    for (const node of choiceNodes) {
      const out = outgoing.get(node.id) ?? [];
      if (out.length < 2) {
        issues.push({
          code: "V010",
          severity: "warning",
          message: `선택지 노드 "${node.label}"에 나가는 간선이 ${out.length}개입니다. 최소 2개 필요합니다.`,
          nodeId: node.id,
          chapterId,
        });
      }
    }

    // V011: Empty scene nodes (no dialogues)
    const sceneNodes = nodes.filter((n) => n.type === "scene" || n.type === "start");
    const dialogueChecks = await Promise.all(
      sceneNodes.map(async (node) => {
        const dialogues = await this.dialogueService.findByNode(node.id);
        return { node, count: dialogues.length };
      }),
    );

    for (const { node, count } of dialogueChecks) {
      if (count === 0) {
        issues.push({
          code: "V011",
          severity: "info",
          message: `노드 "${node.label}" (${node.type})에 대사가 없습니다.`,
          nodeId: node.id,
          chapterId,
        });
      }
    }

    // V012: Empty graph
    if (nodes.length === 0) {
      issues.push({
        code: "V012",
        severity: "info",
        message: "그래프가 비어있습니다. 노드를 추가해주세요.",
        chapterId,
      });
    }

    const errorCount = issues.filter((i) => i.severity === "error").length;
    const warningCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;

    return {
      chapterId,
      chapterTitle,
      issues,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        errorCount,
        warningCount,
        infoCount,
      },
    };
  }
}
