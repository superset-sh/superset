import { Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDrizzle, storyStudioFlags } from "@superbuilder/drizzle";
import type { DrizzleDB, NewStoryStudioFlag } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";

const logger = createLogger("story-studio");

@Injectable()
export class FlagService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async findByProject(projectId: string) {
    return this.db.query.storyStudioFlags.findMany({
      where: eq(storyStudioFlags.projectId, projectId),
    });
  }

  async findById(id: string) {
    const flag = await this.db.query.storyStudioFlags.findFirst({
      where: eq(storyStudioFlags.id, id),
    });

    if (!flag) {
      throw new NotFoundException(`Flag not found: ${id}`);
    }

    return flag;
  }

  async create(input: {
    projectId: string;
    name: string;
    type?: string;
    defaultValue?: string;
    category?: string;
    description?: string;
    isInterpolatable?: boolean;
  }) {
    const [created] = await this.db
      .insert(storyStudioFlags)
      .values({
        projectId: input.projectId,
        name: input.name,
        type: input.type as any,
        defaultValue: input.defaultValue,
        category: input.category as any,
        description: input.description,
        isInterpolatable: input.isInterpolatable ?? false,
      })
      .returning();

    logger.info("Flag created", {
      "story_studio.flag_id": created!.id,
      "story_studio.project_id": input.projectId,
      "story_studio.flag_name": created!.name,
    });

    return created!;
  }

  async update(
    id: string,
    input: Partial<{
      name: string;
      type: string;
      defaultValue: string;
      category: string;
      description: string;
      isInterpolatable: boolean;
    }>,
  ) {
    await this.findById(id);

    const [updated] = await this.db
      .update(storyStudioFlags)
      .set(input as Partial<NewStoryStudioFlag>)
      .where(eq(storyStudioFlags.id, id))
      .returning();

    logger.info("Flag updated", {
      "story_studio.flag_id": id,
    });

    return updated;
  }

  async delete(id: string) {
    await this.findById(id);

    await this.db
      .delete(storyStudioFlags)
      .where(eq(storyStudioFlags.id, id));

    logger.info("Flag deleted", {
      "story_studio.flag_id": id,
    });

    return { success: true };
  }
}
