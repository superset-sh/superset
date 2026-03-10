import { Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDrizzle, storyStudioEndings } from "@superbuilder/drizzle";
import type { DrizzleDB, NewStoryStudioEnding, StoryStudioCondition } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";

const logger = createLogger("story-studio");

@Injectable()
export class EndingService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async findByProject(projectId: string) {
    return this.db.query.storyStudioEndings.findMany({
      where: eq(storyStudioEndings.projectId, projectId),
    });
  }

  async findById(id: string) {
    const ending = await this.db.query.storyStudioEndings.findFirst({
      where: eq(storyStudioEndings.id, id),
    });

    if (!ending) {
      throw new NotFoundException(`Ending not found: ${id}`);
    }

    return ending;
  }

  async create(input: {
    projectId: string;
    title: string;
    type?: string;
    description?: string;
    requiredFlags?: StoryStudioCondition[];
    graphNodeId?: string;
    difficulty?: string;
    discoveryHint?: string;
  }) {
    const [created] = await this.db
      .insert(storyStudioEndings)
      .values({
        projectId: input.projectId,
        title: input.title,
        type: input.type as any,
        description: input.description,
        requiredFlags: input.requiredFlags ?? [],
        graphNodeId: input.graphNodeId,
        difficulty: input.difficulty as any,
        discoveryHint: input.discoveryHint,
      })
      .returning();

    logger.info("Ending created", {
      "story_studio.ending_id": created!.id,
      "story_studio.project_id": input.projectId,
      "story_studio.ending_type": created!.type,
    });

    return created!;
  }

  async update(
    id: string,
    input: Partial<{
      title: string;
      type: string;
      description: string;
      requiredFlags: StoryStudioCondition[];
      graphNodeId: string;
      difficulty: string;
      discoveryHint: string;
    }>,
  ) {
    await this.findById(id);

    const [updated] = await this.db
      .update(storyStudioEndings)
      .set(input as Partial<NewStoryStudioEnding>)
      .where(eq(storyStudioEndings.id, id))
      .returning();

    logger.info("Ending updated", {
      "story_studio.ending_id": id,
    });

    return updated;
  }

  async delete(id: string) {
    await this.findById(id);

    await this.db
      .delete(storyStudioEndings)
      .where(eq(storyStudioEndings.id, id));

    logger.info("Ending deleted", {
      "story_studio.ending_id": id,
    });

    return { success: true };
  }
}
