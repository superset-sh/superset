import { Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import {
  InjectDrizzle,
  storyStudioGraphNodes,
  storyStudioGraphEdges,
  storyStudioDialogues,
  storyStudioCharacters,
} from "@superbuilder/drizzle";
import type {
  DrizzleDB,
  NewStoryStudioGraphNode,
  NewStoryStudioGraphEdge,
} from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";

const logger = createLogger("story-studio");

@Injectable()
export class GraphService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async getGraph(chapterId: string) {
    const [nodes, edges] = await Promise.all([
      this.db.query.storyStudioGraphNodes.findMany({
        where: eq(storyStudioGraphNodes.chapterId, chapterId),
      }),
      this.db.query.storyStudioGraphEdges.findMany({
        where: eq(storyStudioGraphEdges.chapterId, chapterId),
      }),
    ]);

    return { nodes, edges };
  }

  async createNode(input: {
    projectId: string;
    chapterId: string;
    type: string;
    code: string;
    label: string;
    positionX?: number;
    positionY?: number;
    metadata?: Record<string, unknown>;
  }) {
    const [created] = await this.db
      .insert(storyStudioGraphNodes)
      .values({
        projectId: input.projectId,
        chapterId: input.chapterId,
        type: input.type as any,
        code: input.code,
        label: input.label,
        positionX: input.positionX ?? 0,
        positionY: input.positionY ?? 0,
        metadata: input.metadata,
      })
      .returning();

    logger.info("Graph node created", {
      "story_studio.node_id": created!.id,
      "story_studio.chapter_id": input.chapterId,
      "story_studio.node_type": input.type,
    });

    return created!;
  }

  async updateNode(
    id: string,
    input: Partial<{
      label: string;
      code: string;
      type: string;
      positionX: number;
      positionY: number;
      metadata: Record<string, unknown>;
    }>,
  ) {
    await this.findNodeById(id);

    const [updated] = await this.db
      .update(storyStudioGraphNodes)
      .set(input as Partial<NewStoryStudioGraphNode>)
      .where(eq(storyStudioGraphNodes.id, id))
      .returning();

    logger.info("Graph node updated", {
      "story_studio.node_id": id,
    });

    return updated;
  }

  async deleteNode(id: string) {
    await this.findNodeById(id);

    await this.db
      .delete(storyStudioGraphNodes)
      .where(eq(storyStudioGraphNodes.id, id));

    logger.info("Graph node deleted", {
      "story_studio.node_id": id,
    });

    return { success: true };
  }

  async createEdge(input: {
    projectId: string;
    chapterId: string;
    sourceNodeId: string;
    targetNodeId: string;
    label?: string;
    conditions?: unknown[];
    effects?: unknown[];
  }) {
    const [created] = await this.db
      .insert(storyStudioGraphEdges)
      .values({
        projectId: input.projectId,
        chapterId: input.chapterId,
        sourceNodeId: input.sourceNodeId,
        targetNodeId: input.targetNodeId,
        label: input.label,
        conditions: input.conditions as any,
        effects: input.effects as any,
      })
      .returning();

    logger.info("Graph edge created", {
      "story_studio.edge_id": created!.id,
      "story_studio.chapter_id": input.chapterId,
    });

    return created!;
  }

  async updateEdge(
    id: string,
    input: Partial<{
      label: string;
      conditions: unknown[];
      effects: unknown[];
      order: number;
    }>,
  ) {
    await this.findEdgeById(id);

    const [updated] = await this.db
      .update(storyStudioGraphEdges)
      .set(input as Partial<NewStoryStudioGraphEdge>)
      .where(eq(storyStudioGraphEdges.id, id))
      .returning();

    logger.info("Graph edge updated", {
      "story_studio.edge_id": id,
    });

    return updated;
  }

  async deleteEdge(id: string) {
    await this.findEdgeById(id);

    await this.db
      .delete(storyStudioGraphEdges)
      .where(eq(storyStudioGraphEdges.id, id));

    logger.info("Graph edge deleted", {
      "story_studio.edge_id": id,
    });

    return { success: true };
  }

  async updateNodePositions(
    updates: { id: string; positionX: number; positionY: number }[],
  ) {
    for (const update of updates) {
      await this.db
        .update(storyStudioGraphNodes)
        .set({ positionX: update.positionX, positionY: update.positionY })
        .where(eq(storyStudioGraphNodes.id, update.id));
    }

    logger.info("Node positions updated", {
      "story_studio.count": updates.length,
    });

    return { success: true };
  }

  async getNodeSummaries(chapterId: string) {
    const nodes = await this.db.query.storyStudioGraphNodes.findMany({
      where: eq(storyStudioGraphNodes.chapterId, chapterId),
      columns: { id: true, type: true },
    });

    const sceneNodeIds = nodes
      .filter((n) => n.type === "scene")
      .map((n) => n.id);

    if (sceneNodeIds.length === 0) return [];

    // Get dialogues for scene nodes
    const dialogues = await this.db.query.storyStudioDialogues.findMany({
      where: and(
        eq(storyStudioDialogues.chapterId, chapterId),
        eq(storyStudioDialogues.isDeleted, false),
        inArray(storyStudioDialogues.branchNodeId, sceneNodeIds),
      ),
      columns: {
        branchNodeId: true,
        speakerId: true,
        emotion: true,
      },
    });

    // Collect unique speaker IDs
    const speakerIds = [
      ...new Set(
        dialogues
          .map((d) => d.speakerId)
          .filter((id): id is string => id !== null),
      ),
    ];

    // Fetch character names in one query
    const speakerMap = new Map<string, string>();
    if (speakerIds.length > 0) {
      const characters = await this.db.query.storyStudioCharacters.findMany({
        where: inArray(storyStudioCharacters.id, speakerIds),
        columns: { id: true, name: true },
      });
      for (const c of characters) {
        speakerMap.set(c.id, c.name);
      }
    }

    // Aggregate per node
    const summaryMap = new Map<
      string,
      {
        nodeId: string;
        dialogueCount: number;
        characterNames: string[];
        emotionalTone: string | null;
      }
    >();

    for (const d of dialogues) {
      const existing = summaryMap.get(d.branchNodeId) ?? {
        nodeId: d.branchNodeId,
        dialogueCount: 0,
        characterNames: [],
        emotionalTone: null,
      };
      existing.dialogueCount += 1;

      const speakerName = d.speakerId ? speakerMap.get(d.speakerId) : undefined;
      if (speakerName && !existing.characterNames.includes(speakerName)) {
        existing.characterNames.push(speakerName);
      }
      if (d.emotion && !existing.emotionalTone) {
        existing.emotionalTone = d.emotion;
      }
      summaryMap.set(d.branchNodeId, existing);
    }

    return Array.from(summaryMap.values());
  }

  private async findNodeById(id: string) {
    const node = await this.db.query.storyStudioGraphNodes.findFirst({
      where: eq(storyStudioGraphNodes.id, id),
    });

    if (!node) {
      throw new NotFoundException(`Graph node not found: ${id}`);
    }

    return node;
  }

  private async findEdgeById(id: string) {
    const edge = await this.db.query.storyStudioGraphEdges.findFirst({
      where: eq(storyStudioGraphEdges.id, id),
    });

    if (!edge) {
      throw new NotFoundException(`Graph edge not found: ${id}`);
    }

    return edge;
  }
}
