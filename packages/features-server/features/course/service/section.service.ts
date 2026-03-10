import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { eq, asc, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import { courseSections, courseLessons } from "@superbuilder/drizzle";
import type { CourseSection } from "@superbuilder/drizzle";
import type { CreateSectionInput, UpdateSectionInput, ReorderInput, SectionWithLessons } from "../types";

@Injectable()
export class SectionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>,
  ) {}

  async findByCourseId(courseId: string): Promise<SectionWithLessons[]> {
    const sections = await this.db
      .select()
      .from(courseSections)
      .where(eq(courseSections.courseId, courseId))
      .orderBy(asc(courseSections.sortOrder));

    const result: SectionWithLessons[] = [];
    for (const section of sections) {
      const lessons = await this.db
        .select()
        .from(courseLessons)
        .where(eq(courseLessons.sectionId, section.id))
        .orderBy(asc(courseLessons.sortOrder));

      result.push({ ...section, lessons });
    }

    return result;
  }

  async findById(id: string): Promise<CourseSection> {
    const [section] = await this.db
      .select()
      .from(courseSections)
      .where(eq(courseSections.id, id))
      .limit(1);

    if (!section) {
      throw new NotFoundException(`Section not found: ${id}`);
    }

    return section;
  }

  async create(input: CreateSectionInput): Promise<CourseSection> {
    const [maxOrder] = await this.db
      .select({ max: sql<number>`COALESCE(MAX(${courseSections.sortOrder}), -1)` })
      .from(courseSections)
      .where(eq(courseSections.courseId, input.courseId));

    const [created] = await this.db
      .insert(courseSections)
      .values({
        courseId: input.courseId,
        title: input.title,
        description: input.description,
        sortOrder: (maxOrder?.max ?? -1) + 1,
      })
      .returning();

    return created!;
  }

  async update(id: string, input: UpdateSectionInput): Promise<CourseSection> {
    await this.findById(id);

    const [updated] = await this.db
      .update(courseSections)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      })
      .where(eq(courseSections.id, id))
      .returning();

    return updated!;
  }

  async delete(id: string): Promise<{ success: boolean; courseId: string }> {
    const section = await this.findById(id);

    await this.db.delete(courseLessons).where(eq(courseLessons.sectionId, id));
    await this.db.delete(courseSections).where(eq(courseSections.id, id));

    return { success: true, courseId: section.courseId };
  }

  async reorder(items: ReorderInput[]): Promise<{ success: boolean }> {
    await this.db.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .update(courseSections)
          .set({ sortOrder: item.sortOrder })
          .where(eq(courseSections.id, item.id));
      }
    });

    return { success: true };
  }
}
