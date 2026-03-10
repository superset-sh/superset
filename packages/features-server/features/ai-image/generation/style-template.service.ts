import {
  Injectable,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { InjectDrizzle } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle";
import { aiImageStyleTemplates } from "@superbuilder/drizzle";
import { eq, asc } from "drizzle-orm";
import { createLogger } from "../../../core/logger";

const logger = createLogger("ai-image");

@Injectable()
export class StyleTemplateService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async findActive() {
    return this.db.query.aiImageStyleTemplates.findMany({
      where: eq(aiImageStyleTemplates.isActive, true),
      orderBy: [asc(aiImageStyleTemplates.sortOrder)],
    });
  }

  async findById(id: string) {
    const template = await this.db.query.aiImageStyleTemplates.findFirst({
      where: eq(aiImageStyleTemplates.id, id),
    });
    if (!template) {
      throw new NotFoundException(`Style template not found: ${id}`);
    }
    return template;
  }

  async create(input: {
    name: string;
    description?: string;
    promptSuffix: string;
    category: "instagram" | "thumbnail" | "banner";
    thumbnailUrl?: string;
    sortOrder?: number;
  }) {
    const slug = this.generateSlug(input.name);

    const existing = await this.db.query.aiImageStyleTemplates.findFirst({
      where: eq(aiImageStyleTemplates.slug, slug),
    });
    if (existing) {
      throw new ConflictException(
        `Style template slug already exists: ${slug}`,
      );
    }

    const rows = await this.db
      .insert(aiImageStyleTemplates)
      .values({ ...input, slug, sortOrder: input.sortOrder ?? 0 })
      .returning();

    const template = rows[0];
    if (!template) {
      throw new ConflictException("Failed to create style template");
    }

    logger.info("Style template created", {
      "ai_image.style_id": template.id,
      "ai_image.style_name": template.name,
      "ai_image.category": template.category,
    });

    return template;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      promptSuffix: string;
      category: "instagram" | "thumbnail" | "banner";
      thumbnailUrl: string;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    await this.findById(id);

    const updateData: Record<string, unknown> = { ...data };

    if (data.name) {
      updateData.slug = this.generateSlug(data.name);
    }

    await this.db
      .update(aiImageStyleTemplates)
      .set(updateData)
      .where(eq(aiImageStyleTemplates.id, id));

    logger.info("Style template updated", {
      "ai_image.style_id": id,
    });

    return this.findById(id);
  }

  async delete(id: string) {
    await this.findById(id);

    await this.db
      .delete(aiImageStyleTemplates)
      .where(eq(aiImageStyleTemplates.id, id));

    logger.info("Style template deleted", {
      "ai_image.style_id": id,
    });

    return { success: true };
  }

  private generateSlug(name: string): string {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return `${baseSlug}-${Date.now().toString(36)}`;
  }
}
