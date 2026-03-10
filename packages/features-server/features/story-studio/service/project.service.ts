import { Injectable, NotFoundException } from "@nestjs/common";
import { eq, and, desc } from "drizzle-orm";
import { InjectDrizzle, storyStudioProjects } from "@superbuilder/drizzle";
import type { DrizzleDB, NewStoryStudioProject } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";

const logger = createLogger("story-studio");

@Injectable()
export class ProjectService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async findAll(authorId: string) {
    return this.db.query.storyStudioProjects.findMany({
      where: and(
        eq(storyStudioProjects.authorId, authorId),
        eq(storyStudioProjects.isDeleted, false),
      ),
      orderBy: [desc(storyStudioProjects.createdAt)],
    });
  }

  async findById(id: string) {
    const project = await this.db.query.storyStudioProjects.findFirst({
      where: and(
        eq(storyStudioProjects.id, id),
        eq(storyStudioProjects.isDeleted, false),
      ),
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${id}`);
    }

    return project;
  }

  async create(
    input: { title: string; genre?: string; description?: string },
    authorId: string,
  ) {
    const [created] = await this.db
      .insert(storyStudioProjects)
      .values({ ...input, authorId })
      .returning();

    logger.info("Project created", {
      "story_studio.project_id": created!.id,
      "story_studio.title": created!.title,
      "user.id": authorId,
    });

    return created!;
  }

  async update(
    id: string,
    input: Partial<{
      title: string;
      genre: string;
      description: string;
      status: string;
    }>,
  ) {
    await this.findById(id);

    const [updated] = await this.db
      .update(storyStudioProjects)
      .set(input as Partial<NewStoryStudioProject>)
      .where(eq(storyStudioProjects.id, id))
      .returning();

    logger.info("Project updated", {
      "story_studio.project_id": id,
    });

    return updated;
  }

  async delete(id: string) {
    await this.findById(id);

    await this.db
      .update(storyStudioProjects)
      .set({ isDeleted: true })
      .where(eq(storyStudioProjects.id, id));

    logger.info("Project deleted", {
      "story_studio.project_id": id,
    });

    return { success: true };
  }
}
