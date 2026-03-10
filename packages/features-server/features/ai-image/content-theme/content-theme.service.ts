import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { InjectDrizzle } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle";
import { aiImageContentThemes } from "@superbuilder/drizzle";
import { eq, asc } from "drizzle-orm";
import { createLogger } from "../../../core/logger";

const logger = createLogger("ai-image");

@Injectable()
export class ContentThemeService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async findActive() {
    return this.db.query.aiImageContentThemes.findMany({
      where: eq(aiImageContentThemes.isActive, true),
      orderBy: [asc(aiImageContentThemes.sortOrder)],
    });
  }

  async findById(id: string) {
    const theme = await this.db.query.aiImageContentThemes.findFirst({
      where: eq(aiImageContentThemes.id, id),
    });
    if (!theme) {
      throw new NotFoundException(`Content theme not found: ${id}`);
    }
    return theme;
  }

  async create(input: {
    name: string;
    description?: string;
    promptTemplate: string;
    recommendedStyleIds?: string[];
    recommendedFormat?: "feed" | "carousel" | "story" | "reels_cover";
    thumbnailUrl?: string;
    sortOrder?: number;
  }) {
    const slug = this.generateSlug(input.name);

    const existing = await this.db.query.aiImageContentThemes.findFirst({
      where: eq(aiImageContentThemes.slug, slug),
    });
    if (existing) {
      throw new ConflictException(
        `Content theme slug already exists: ${slug}`,
      );
    }

    const rows = await this.db
      .insert(aiImageContentThemes)
      .values({ ...input, slug, sortOrder: input.sortOrder ?? 0 })
      .returning();

    const theme = rows[0];
    if (!theme) {
      throw new InternalServerErrorException("Failed to create content theme");
    }

    logger.info("Content theme created", {
      "ai_image.theme_id": theme.id,
      "ai_image.theme_name": theme.name,
    });

    return theme;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      promptTemplate: string;
      recommendedStyleIds: string[];
      recommendedFormat: "feed" | "carousel" | "story" | "reels_cover";
      thumbnailUrl: string;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    await this.findById(id);

    const updateData: Record<string, unknown> = { ...data };

    if (data.name) {
      const newSlug = this.generateSlug(data.name);
      const slugConflict = await this.db.query.aiImageContentThemes.findFirst({
        where: eq(aiImageContentThemes.slug, newSlug),
      });
      if (slugConflict) {
        throw new ConflictException(
          `Content theme slug already exists: ${newSlug}`,
        );
      }
      updateData.slug = newSlug;
    }

    await this.db
      .update(aiImageContentThemes)
      .set(updateData)
      .where(eq(aiImageContentThemes.id, id));

    logger.info("Content theme updated", {
      "ai_image.theme_id": id,
    });

    return this.findById(id);
  }

  async delete(id: string) {
    await this.findById(id);

    await this.db
      .update(aiImageContentThemes)
      .set({ isActive: false })
      .where(eq(aiImageContentThemes.id, id));

    logger.info("Content theme deactivated", {
      "ai_image.theme_id": id,
    });

    return { success: true };
  }

  resolveThemePrompt(
    promptTemplate: string,
    variables?: Record<string, string>,
  ): string {
    const requiredVars =
      promptTemplate.match(/\{\{(\w+)\}\}/g)?.map((m) => m.slice(2, -2)) ?? [];
    const vars = variables ?? {};

    for (const key of requiredVars) {
      if (!vars[key]?.trim()) {
        throw new BadRequestException(`{{${key}}}을(를) 입력해주세요`);
      }
    }

    return requiredVars.reduce(
      (result, key) => result.replace(`{{${key}}}`, vars[key] ?? ""),
      promptTemplate,
    );
  }

  private generateSlug(name: string): string {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return `${baseSlug}-${Date.now().toString(36)}`;
  }
}
