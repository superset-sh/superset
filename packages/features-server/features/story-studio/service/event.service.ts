import { Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDrizzle, storyStudioEvents } from "@superbuilder/drizzle";
import type { DrizzleDB, NewStoryStudioEvent, StoryStudioEffect } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";

const logger = createLogger("story-studio");

@Injectable()
export class EventService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async findByProject(projectId: string) {
    return this.db.query.storyStudioEvents.findMany({
      where: eq(storyStudioEvents.projectId, projectId),
    });
  }

  async findById(id: string) {
    const event = await this.db.query.storyStudioEvents.findFirst({
      where: eq(storyStudioEvents.id, id),
    });

    if (!event) {
      throw new NotFoundException(`Event not found: ${id}`);
    }

    return event;
  }

  async create(input: {
    projectId: string;
    name: string;
    type?: string;
    description?: string;
    effects?: StoryStudioEffect[];
    triggeredNodes?: string[];
  }) {
    const [created] = await this.db
      .insert(storyStudioEvents)
      .values({
        projectId: input.projectId,
        name: input.name,
        type: input.type as any,
        description: input.description,
        effects: input.effects ?? [],
        triggeredNodes: input.triggeredNodes ?? [],
      })
      .returning();

    logger.info("Event created", {
      "story_studio.event_id": created!.id,
      "story_studio.project_id": input.projectId,
      "story_studio.event_type": created!.type,
    });

    return created!;
  }

  async update(
    id: string,
    input: Partial<{
      name: string;
      type: string;
      description: string;
      effects: StoryStudioEffect[];
      triggeredNodes: string[];
    }>,
  ) {
    await this.findById(id);

    const [updated] = await this.db
      .update(storyStudioEvents)
      .set(input as Partial<NewStoryStudioEvent>)
      .where(eq(storyStudioEvents.id, id))
      .returning();

    logger.info("Event updated", {
      "story_studio.event_id": id,
    });

    return updated;
  }

  async delete(id: string) {
    await this.findById(id);

    await this.db
      .delete(storyStudioEvents)
      .where(eq(storyStudioEvents.id, id));

    logger.info("Event deleted", {
      "story_studio.event_id": id,
    });

    return { success: true };
  }
}
