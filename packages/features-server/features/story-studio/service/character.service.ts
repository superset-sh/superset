import { Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDrizzle, storyStudioCharacters } from "@superbuilder/drizzle";
import type { DrizzleDB, NewStoryStudioCharacter } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";

const logger = createLogger("story-studio");

@Injectable()
export class CharacterService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async findByProject(projectId: string) {
    return this.db.query.storyStudioCharacters.findMany({
      where: eq(storyStudioCharacters.projectId, projectId),
    });
  }

  async findById(id: string) {
    const character = await this.db.query.storyStudioCharacters.findFirst({
      where: eq(storyStudioCharacters.id, id),
    });

    if (!character) {
      throw new NotFoundException(`Character not found: ${id}`);
    }

    return character;
  }

  async create(input: {
    projectId: string;
    name: string;
    code: string;
    role?: string;
    personality?: string;
    speechStyle?: string;
  }) {
    const [created] = await this.db
      .insert(storyStudioCharacters)
      .values({
        projectId: input.projectId,
        name: input.name,
        code: input.code,
        role: input.role as any,
        personality: input.personality,
        speechStyle: input.speechStyle,
      })
      .returning();

    logger.info("Character created", {
      "story_studio.character_id": created!.id,
      "story_studio.project_id": input.projectId,
      "story_studio.character_name": created!.name,
    });

    return created!;
  }

  async update(
    id: string,
    input: Partial<{
      name: string;
      code: string;
      role: string;
      personality: string;
      speechStyle: string;
    }>,
  ) {
    await this.findById(id);

    const [updated] = await this.db
      .update(storyStudioCharacters)
      .set(input as Partial<NewStoryStudioCharacter>)
      .where(eq(storyStudioCharacters.id, id))
      .returning();

    logger.info("Character updated", {
      "story_studio.character_id": id,
    });

    return updated;
  }

  async delete(id: string) {
    await this.findById(id);

    await this.db
      .delete(storyStudioCharacters)
      .where(eq(storyStudioCharacters.id, id));

    logger.info("Character deleted", {
      "story_studio.character_id": id,
    });

    return { success: true };
  }
}
