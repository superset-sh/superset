import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { eq, asc, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import { courseAttachments, files } from "@superbuilder/drizzle";
import type { CourseAttachment } from "@superbuilder/drizzle";
import type { ReorderInput } from "../types";

@Injectable()
export class AttachmentService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>,
  ) {}

  async findByCourseId(courseId: string): Promise<(CourseAttachment & { file?: { name: string; url: string; mimeType: string; size: number } | null })[]> {
    const attachments = await this.db
      .select({
        id: courseAttachments.id,
        courseId: courseAttachments.courseId,
        fileId: courseAttachments.fileId,
        url: courseAttachments.url,
        fileType: courseAttachments.fileType,
        title: courseAttachments.title,
        sortOrder: courseAttachments.sortOrder,
        createdAt: courseAttachments.createdAt,
        updatedAt: courseAttachments.updatedAt,
        file: {
          name: files.originalName,
          url: files.url,
          mimeType: files.mimeType,
          size: files.size,
        },
      })
      .from(courseAttachments)
      .leftJoin(files, eq(courseAttachments.fileId, files.id))
      .where(eq(courseAttachments.courseId, courseId))
      .orderBy(asc(courseAttachments.sortOrder));

    return attachments;
  }

  async create(input: {
    courseId: string;
    fileId?: string;
    url?: string;
    fileType?: string;
    title?: string;
  }): Promise<CourseAttachment> {
    const { courseId, fileId, url, fileType, title } = input;

    const [maxOrder] = await this.db
      .select({ max: sql<number>`COALESCE(MAX(${courseAttachments.sortOrder}), -1)` })
      .from(courseAttachments)
      .where(eq(courseAttachments.courseId, courseId));

    const [created] = await this.db
      .insert(courseAttachments)
      .values({
        courseId,
        ...(fileId ? { fileId } : {}),
        ...(url ? { url } : {}),
        ...(fileType ? { fileType } : {}),
        title,
        sortOrder: (maxOrder?.max ?? -1) + 1,
      })
      .returning();

    return created!;
  }

  async delete(id: string): Promise<{ success: boolean }> {
    const [attachment] = await this.db
      .select()
      .from(courseAttachments)
      .where(eq(courseAttachments.id, id))
      .limit(1);

    if (!attachment) {
      throw new NotFoundException(`Attachment not found: ${id}`);
    }

    await this.db.delete(courseAttachments).where(eq(courseAttachments.id, id));

    return { success: true };
  }

  async reorder(items: ReorderInput[]): Promise<{ success: boolean }> {
    await this.db.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .update(courseAttachments)
          .set({ sortOrder: item.sortOrder })
          .where(eq(courseAttachments.id, item.id));
      }
    });

    return { success: true };
  }
}
