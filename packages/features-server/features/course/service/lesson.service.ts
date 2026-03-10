import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import { courseLessons, courseSections, files } from "@superbuilder/drizzle";
import type { CourseLesson } from "@superbuilder/drizzle";
import type { CreateLessonInput, UpdateLessonInput, SetVideoInput, ReorderInput, LessonWithVideo } from "../types";

@Injectable()
export class LessonService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>,
  ) {}

  async findById(id: string): Promise<CourseLesson> {
    const [lesson] = await this.db
      .select()
      .from(courseLessons)
      .where(eq(courseLessons.id, id))
      .limit(1);

    if (!lesson) {
      throw new NotFoundException(`Lesson not found: ${id}`);
    }

    return lesson;
  }

  async findByIdWithVideo(id: string): Promise<LessonWithVideo> {
    const lesson = await this.findById(id);

    if (lesson.videoFileId) {
      const [file] = await this.db
        .select({ url: files.url })
        .from(files)
        .where(eq(files.id, lesson.videoFileId))
        .limit(1);

      return { ...lesson, videoUrl: file?.url ?? null };
    }

    return { ...lesson, videoUrl: null };
  }

  async getCourseIdByLessonId(lessonId: string): Promise<string> {
    const lesson = await this.findById(lessonId);
    const [section] = await this.db
      .select({ courseId: courseSections.courseId })
      .from(courseSections)
      .where(eq(courseSections.id, lesson.sectionId))
      .limit(1);

    if (!section) {
      throw new NotFoundException(`Section not found for lesson: ${lessonId}`);
    }

    return section.courseId;
  }

  async create(input: CreateLessonInput): Promise<CourseLesson> {
    const [maxOrder] = await this.db
      .select({ max: sql<number>`COALESCE(MAX(${courseLessons.sortOrder}), -1)` })
      .from(courseLessons)
      .where(eq(courseLessons.sectionId, input.sectionId));

    const [created] = await this.db
      .insert(courseLessons)
      .values({
        sectionId: input.sectionId,
        title: input.title,
        description: input.description,
        isFree: input.isFree ?? false,
        sortOrder: (maxOrder?.max ?? -1) + 1,
      })
      .returning();

    return created!;
  }

  async update(id: string, input: UpdateLessonInput): Promise<CourseLesson> {
    await this.findById(id);

    const [updated] = await this.db
      .update(courseLessons)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.isFree !== undefined && { isFree: input.isFree }),
      })
      .where(eq(courseLessons.id, id))
      .returning();

    return updated!;
  }

  async delete(id: string): Promise<{ success: boolean; courseId: string }> {
    const courseId = await this.getCourseIdByLessonId(id);
    await this.db.delete(courseLessons).where(eq(courseLessons.id, id));
    return { success: true, courseId };
  }

  async setVideo(id: string, input: SetVideoInput): Promise<CourseLesson> {
    await this.findById(id);

    const [updated] = await this.db
      .update(courseLessons)
      .set({
        videoFileId: input.videoFileId,
        videoDurationSeconds: input.videoDurationSeconds,
      })
      .where(eq(courseLessons.id, id))
      .returning();

    return updated!;
  }

  async removeVideo(id: string): Promise<CourseLesson> {
    await this.findById(id);

    const [updated] = await this.db
      .update(courseLessons)
      .set({
        videoFileId: null,
        videoDurationSeconds: null,
      })
      .where(eq(courseLessons.id, id))
      .returning();

    return updated!;
  }

  async reorder(items: ReorderInput[]): Promise<{ success: boolean }> {
    await this.db.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .update(courseLessons)
          .set({ sortOrder: item.sortOrder })
          .where(eq(courseLessons.id, item.id));
      }
    });

    return { success: true };
  }
}
