import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { eq, asc, and, count, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import { courseTopics, courseCourses } from "@superbuilder/drizzle";
import type { CourseTopic } from "@superbuilder/drizzle";
import type { CreateTopicInput, UpdateTopicInput, ReorderInput } from "../types";

@Injectable()
export class TopicService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>,
  ) {}

  async findAll(includeInactive = false): Promise<CourseTopic[]> {
    const conditions = includeInactive ? [] : [eq(courseTopics.isActive, true)];

    return this.db
      .select()
      .from(courseTopics)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(courseTopics.sortOrder));
  }

  async findById(id: string): Promise<CourseTopic> {
    const [topic] = await this.db
      .select()
      .from(courseTopics)
      .where(eq(courseTopics.id, id))
      .limit(1);

    if (!topic) {
      throw new NotFoundException(`Topic not found: ${id}`);
    }

    return topic;
  }

  async create(input: CreateTopicInput): Promise<CourseTopic> {
    const slug = input.slug || this.generateSlug(input.name);

    const existing = await this.db
      .select()
      .from(courseTopics)
      .where(eq(courseTopics.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException(`Slug already exists: ${slug}`);
    }

    const [maxOrder] = await this.db
      .select({ max: sql<number>`COALESCE(MAX(${courseTopics.sortOrder}), -1)` })
      .from(courseTopics);

    const [created] = await this.db
      .insert(courseTopics)
      .values({
        name: input.name,
        slug,
        description: input.description,
        thumbnailUrl: input.thumbnailUrl,
        sortOrder: (maxOrder?.max ?? -1) + 1,
      })
      .returning();

    return created!;
  }

  async update(id: string, input: UpdateTopicInput): Promise<CourseTopic> {
    await this.findById(id);

    if (input.slug) {
      const existing = await this.db
        .select()
        .from(courseTopics)
        .where(and(eq(courseTopics.slug, input.slug), sql`${courseTopics.id} != ${id}`))
        .limit(1);

      if (existing.length > 0) {
        throw new ConflictException(`Slug already exists: ${input.slug}`);
      }
    }

    const [updated] = await this.db
      .update(courseTopics)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug: input.slug }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.thumbnailUrl !== undefined && { thumbnailUrl: input.thumbnailUrl }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      })
      .where(eq(courseTopics.id, id))
      .returning();

    return updated!;
  }

  async delete(id: string): Promise<{ success: boolean }> {
    await this.findById(id);

    const [courseCount] = await this.db
      .select({ total: count() })
      .from(courseCourses)
      .where(eq(courseCourses.topicId, id));

    if ((courseCount?.total ?? 0) > 0) {
      throw new BadRequestException("이 주제에 강의가 존재합니다");
    }

    await this.db.delete(courseTopics).where(eq(courseTopics.id, id));

    return { success: true };
  }

  async reorder(items: ReorderInput[]): Promise<{ success: boolean }> {
    await this.db.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .update(courseTopics)
          .set({ sortOrder: item.sortOrder })
          .where(eq(courseTopics.id, item.id));
      }
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
