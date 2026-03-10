import { Injectable, NotFoundException } from "@nestjs/common";
import { eq, and, asc } from "drizzle-orm";
import { InjectDrizzle, storyStudioChapters } from "@superbuilder/drizzle";
import type { DrizzleDB, NewStoryStudioChapter } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";

const logger = createLogger("story-studio");

@Injectable()
export class ChapterService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async findByProject(projectId: string) {
    return this.db.query.storyStudioChapters.findMany({
      where: and(
        eq(storyStudioChapters.projectId, projectId),
        eq(storyStudioChapters.isDeleted, false),
      ),
      orderBy: [asc(storyStudioChapters.order)],
    });
  }

  async findById(id: string) {
    const chapter = await this.db.query.storyStudioChapters.findFirst({
      where: and(
        eq(storyStudioChapters.id, id),
        eq(storyStudioChapters.isDeleted, false),
      ),
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter not found: ${id}`);
    }

    return chapter;
  }

  async create(
    input: { title: string; code: string; order?: number; summary?: string },
    projectId: string,
  ) {
    const [created] = await this.db
      .insert(storyStudioChapters)
      .values({
        ...input,
        projectId,
        order: input.order ?? 0,
      })
      .returning();

    logger.info("Chapter created", {
      "story_studio.chapter_id": created!.id,
      "story_studio.project_id": projectId,
      "story_studio.code": created!.code,
    });

    return created!;
  }

  async update(
    id: string,
    input: Partial<{
      title: string;
      code: string;
      order: number;
      summary: string;
      status: string;
      estimatedPlaytime: string;
    }>,
  ) {
    await this.findById(id);

    const [updated] = await this.db
      .update(storyStudioChapters)
      .set(input as Partial<NewStoryStudioChapter>)
      .where(eq(storyStudioChapters.id, id))
      .returning();

    logger.info("Chapter updated", {
      "story_studio.chapter_id": id,
    });

    return updated;
  }

  async reorder(projectId: string, ids: string[]) {
    for (let i = 0; i < ids.length; i++) {
      await this.db
        .update(storyStudioChapters)
        .set({ order: i })
        .where(
          and(
            eq(storyStudioChapters.id, ids[i]!),
            eq(storyStudioChapters.projectId, projectId),
          ),
        );
    }

    logger.info("Chapters reordered", {
      "story_studio.project_id": projectId,
      "story_studio.count": ids.length,
    });

    return { success: true };
  }

  async delete(id: string) {
    await this.findById(id);

    await this.db
      .update(storyStudioChapters)
      .set({ isDeleted: true })
      .where(eq(storyStudioChapters.id, id));

    logger.info("Chapter deleted", {
      "story_studio.chapter_id": id,
    });

    return { success: true };
  }
}
