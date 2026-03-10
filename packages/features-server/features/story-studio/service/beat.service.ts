import { Injectable, NotFoundException } from "@nestjs/common";
import { eq, and, asc } from "drizzle-orm";
import {
  InjectDrizzle,
  storyStudioBeats,
  storyStudioBeatTemplates,
} from "@superbuilder/drizzle";
import type {
  DrizzleDB,
  NewStoryStudioBeat,
  NewStoryStudioBeatTemplate,
} from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";

const logger = createLogger("story-studio");

@Injectable()
export class BeatService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  // =========================================================================
  // Beat CRUD
  // =========================================================================

  async findByChapter(chapterId: string) {
    return this.db.query.storyStudioBeats.findMany({
      where: eq(storyStudioBeats.chapterId, chapterId),
      orderBy: [asc(storyStudioBeats.order)],
    });
  }

  async findByProject(projectId: string) {
    return this.db.query.storyStudioBeats.findMany({
      where: eq(storyStudioBeats.projectId, projectId),
      orderBy: [asc(storyStudioBeats.order)],
    });
  }

  async findById(id: string) {
    const beat = await this.db.query.storyStudioBeats.findFirst({
      where: eq(storyStudioBeats.id, id),
    });

    if (!beat) {
      throw new NotFoundException(`Beat not found: ${id}`);
    }

    return beat;
  }

  async create(input: {
    projectId: string;
    chapterId: string;
    title: string;
    act?: string;
    beatType?: string;
    summary?: string;
    emotionalTone?: string;
    characters?: string[];
    location?: string;
    purpose?: string;
    linkedNodes?: string[];
    order?: number;
  }) {
    const [created] = await this.db
      .insert(storyStudioBeats)
      .values({
        projectId: input.projectId,
        chapterId: input.chapterId,
        title: input.title,
        act: input.act as any,
        beatType: input.beatType as any,
        summary: input.summary,
        emotionalTone: input.emotionalTone as any,
        characters: input.characters ?? [],
        location: input.location,
        purpose: input.purpose,
        linkedNodes: input.linkedNodes ?? [],
        order: input.order ?? 0,
      })
      .returning();

    logger.info("Beat created", {
      "story_studio.beat_id": created!.id,
      "story_studio.project_id": input.projectId,
      "story_studio.chapter_id": input.chapterId,
    });

    return created!;
  }

  async update(
    id: string,
    input: Partial<{
      title: string;
      act: string;
      beatType: string;
      summary: string;
      emotionalTone: string;
      characters: string[];
      location: string;
      purpose: string;
      linkedNodes: string[];
      order: number;
    }>,
  ) {
    await this.findById(id);

    const [updated] = await this.db
      .update(storyStudioBeats)
      .set(input as Partial<NewStoryStudioBeat>)
      .where(eq(storyStudioBeats.id, id))
      .returning();

    logger.info("Beat updated", {
      "story_studio.beat_id": id,
    });

    return updated;
  }

  async reorder(chapterId: string, ids: string[]) {
    await Promise.all(
      ids.map((id, index) =>
        this.db
          .update(storyStudioBeats)
          .set({ order: index })
          .where(and(eq(storyStudioBeats.id, id), eq(storyStudioBeats.chapterId, chapterId))),
      ),
    );

    logger.info("Beats reordered", {
      "story_studio.chapter_id": chapterId,
      "story_studio.count": ids.length,
    });

    return { success: true };
  }

  async delete(id: string) {
    await this.findById(id);

    await this.db
      .delete(storyStudioBeats)
      .where(eq(storyStudioBeats.id, id));

    logger.info("Beat deleted", {
      "story_studio.beat_id": id,
    });

    return { success: true };
  }

  // =========================================================================
  // BeatTemplate CRUD
  // =========================================================================

  async findAllTemplates() {
    return this.db.query.storyStudioBeatTemplates.findMany({
      orderBy: [asc(storyStudioBeatTemplates.name)],
    });
  }

  async findTemplateById(id: string) {
    const template = await this.db.query.storyStudioBeatTemplates.findFirst({
      where: eq(storyStudioBeatTemplates.id, id),
    });

    if (!template) {
      throw new NotFoundException(`Beat template not found: ${id}`);
    }

    return template;
  }

  async createTemplate(input: {
    name: string;
    structure: string;
    beats?: Array<{ beatType: string; act: string; label: string; description: string }>;
    isBuiltIn?: boolean;
  }) {
    const [created] = await this.db
      .insert(storyStudioBeatTemplates)
      .values({
        name: input.name,
        structure: input.structure as any,
        beats: input.beats ?? [],
        isBuiltIn: input.isBuiltIn ?? false,
      })
      .returning();

    logger.info("Beat template created", {
      "story_studio.template_id": created!.id,
      "story_studio.template_name": input.name,
    });

    return created!;
  }

  async updateTemplate(
    id: string,
    input: Partial<{
      name: string;
      structure: string;
      beats: Array<{ beatType: string; act: string; label: string; description: string }>;
    }>,
  ) {
    await this.findTemplateById(id);

    const [updated] = await this.db
      .update(storyStudioBeatTemplates)
      .set(input as Partial<NewStoryStudioBeatTemplate>)
      .where(eq(storyStudioBeatTemplates.id, id))
      .returning();

    logger.info("Beat template updated", {
      "story_studio.template_id": id,
    });

    return updated;
  }

  async deleteTemplate(id: string) {
    const template = await this.findTemplateById(id);

    if (template.isBuiltIn) {
      throw new Error("Cannot delete built-in template");
    }

    await this.db
      .delete(storyStudioBeatTemplates)
      .where(eq(storyStudioBeatTemplates.id, id));

    logger.info("Beat template deleted", {
      "story_studio.template_id": id,
    });

    return { success: true };
  }
}
