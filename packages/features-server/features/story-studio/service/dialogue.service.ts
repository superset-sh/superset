import { Injectable, NotFoundException } from "@nestjs/common";
import { eq, and, asc } from "drizzle-orm";
import {
  InjectDrizzle,
  storyStudioDialogues,
  storyStudioGraphNodes,
  storyStudioChapters,
} from "@superbuilder/drizzle";
import type {
  DrizzleDB,
  NewStoryStudioDialogue,
  StoryStudioDialogue,
} from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";

const logger = createLogger("story-studio");

@Injectable()
export class DialogueService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async findByNode(branchNodeId: string) {
    return this.db.query.storyStudioDialogues.findMany({
      where: and(
        eq(storyStudioDialogues.branchNodeId, branchNodeId),
        eq(storyStudioDialogues.isDeleted, false),
      ),
      orderBy: [asc(storyStudioDialogues.order)],
    });
  }

  async findById(id: string) {
    const dialogue = await this.db.query.storyStudioDialogues.findFirst({
      where: and(
        eq(storyStudioDialogues.id, id),
        eq(storyStudioDialogues.isDeleted, false),
      ),
    });

    if (!dialogue) {
      throw new NotFoundException(`Dialogue not found: ${id}`);
    }

    return dialogue;
  }

  async create(input: {
    projectId: string;
    chapterId: string;
    branchNodeId: string;
    type?: string;
    speakerId?: string;
    emotion?: string;
    content: string;
    direction?: string;
    timing?: string;
    voiceNote?: string;
    tags?: string[];
    order?: number;
  }) {
    const order = input.order ?? 0;
    const { chapterCode, nodeCode } = await this.lookupCodes(
      input.branchNodeId,
    );
    const stringId = this.generateStringId(chapterCode, nodeCode, order);

    const [created] = await this.db
      .insert(storyStudioDialogues)
      .values({
        projectId: input.projectId,
        chapterId: input.chapterId,
        branchNodeId: input.branchNodeId,
        type: input.type as any,
        speakerId: input.speakerId,
        emotion: input.emotion,
        content: input.content,
        direction: input.direction,
        timing: input.timing,
        voiceNote: input.voiceNote,
        tags: input.tags ?? [],
        stringId,
        order,
      })
      .returning();

    logger.info("Dialogue created", {
      "story_studio.dialogue_id": created!.id,
      "story_studio.node_id": input.branchNodeId,
      "story_studio.string_id": stringId,
    });

    return created!;
  }

  async update(
    id: string,
    input: Partial<{
      type: string;
      speakerId: string;
      emotion: string;
      content: string;
      direction: string;
      timing: string;
      voiceNote: string;
      tags: string[];
    }>,
  ) {
    await this.findById(id);

    const [updated] = await this.db
      .update(storyStudioDialogues)
      .set(input as Partial<NewStoryStudioDialogue>)
      .where(eq(storyStudioDialogues.id, id))
      .returning();

    logger.info("Dialogue updated", {
      "story_studio.dialogue_id": id,
    });

    return updated;
  }

  async reorder(nodeId: string, ids: string[]) {
    for (let i = 0; i < ids.length; i++) {
      await this.db
        .update(storyStudioDialogues)
        .set({ order: i })
        .where(
          and(
            eq(storyStudioDialogues.id, ids[i]!),
            eq(storyStudioDialogues.branchNodeId, nodeId),
          ),
        );
    }

    logger.info("Dialogues reordered", {
      "story_studio.node_id": nodeId,
      "story_studio.count": ids.length,
    });

    return { success: true };
  }

  async delete(id: string) {
    await this.findById(id);

    await this.db
      .update(storyStudioDialogues)
      .set({ isDeleted: true })
      .where(eq(storyStudioDialogues.id, id));

    logger.info("Dialogue deleted", {
      "story_studio.dialogue_id": id,
    });

    return { success: true };
  }

  async bulkCreate(
    nodeId: string,
    lines: {
      projectId: string;
      chapterId: string;
      type?: string;
      speakerId?: string;
      emotion?: string;
      content: string;
      direction?: string;
    }[],
  ) {
    const { chapterCode, nodeCode } = await this.lookupCodes(nodeId);
    const results: StoryStudioDialogue[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const stringId = this.generateStringId(chapterCode, nodeCode, i);

      const [created] = await this.db
        .insert(storyStudioDialogues)
        .values({
          projectId: line.projectId,
          chapterId: line.chapterId,
          branchNodeId: nodeId,
          type: line.type as any,
          speakerId: line.speakerId,
          emotion: line.emotion,
          content: line.content,
          direction: line.direction,
          stringId,
          order: i,
        })
        .returning();

      results.push(created!);
    }

    logger.info("Dialogues bulk created", {
      "story_studio.node_id": nodeId,
      "story_studio.count": lines.length,
    });

    return results;
  }

  private generateStringId(
    chapterCode: string,
    nodeCode: string,
    order: number,
  ): string {
    const lineNumber = String(order).padStart(3, "0");
    return `DLG_${chapterCode}_${nodeCode}_${lineNumber}`;
  }

  private async lookupCodes(branchNodeId: string) {
    const node = await this.db.query.storyStudioGraphNodes.findFirst({
      where: eq(storyStudioGraphNodes.id, branchNodeId),
    });

    if (!node) {
      throw new NotFoundException(`Node not found: ${branchNodeId}`);
    }

    const chapter = await this.db.query.storyStudioChapters.findFirst({
      where: eq(storyStudioChapters.id, node.chapterId),
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter not found: ${node.chapterId}`);
    }

    return { chapterCode: chapter.code, nodeCode: node.code };
  }
}
