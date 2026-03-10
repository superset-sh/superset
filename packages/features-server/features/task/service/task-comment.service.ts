import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { InjectDrizzle } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle";
import { taskComments } from "@superbuilder/drizzle";
import { eq, and, desc } from "drizzle-orm";
import { createLogger } from "../../../core/logger";
import { TaskActivityService } from "./task-activity.service";

const logger = createLogger("task");

@Injectable()
export class TaskCommentService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly activityService: TaskActivityService,
  ) {}

  /**
   * 태스크별 댓글 목록 조회
   */
  async findByTaskId(taskId: string) {
    return this.db.query.taskComments.findMany({
      where: and(
        eq(taskComments.taskId, taskId),
        eq(taskComments.isDeleted, false),
      ),
      with: {
        author: true,
      },
      orderBy: [desc(taskComments.createdAt)],
    });
  }

  /**
   * 댓글 생성
   */
  async create(input: { taskId: string; content: string }, authorId: string) {
    const rows = await this.db
      .insert(taskComments)
      .values({
        taskId: input.taskId,
        content: input.content,
        authorId,
      })
      .returning();

    const comment = rows[0];
    if (!comment) {
      throw new Error("Failed to create comment record");
    }

    // Log activity
    await this.activityService.log(input.taskId, authorId, "commented");

    logger.info("Comment created", {
      "task.comment_id": comment.id,
      "task.task_id": input.taskId,
      "user.id": authorId,
    });

    // Return with author relation
    const created = await this.db.query.taskComments.findFirst({
      where: eq(taskComments.id, comment.id),
      with: {
        author: true,
      },
    });

    if (!created) {
      throw new Error("Failed to retrieve created comment");
    }

    return created;
  }

  /**
   * 댓글 수정
   */
  async update(id: string, content: string, userId: string) {
    const comment = await this.db.query.taskComments.findFirst({
      where: and(
        eq(taskComments.id, id),
        eq(taskComments.isDeleted, false),
      ),
    });

    if (!comment) {
      throw new NotFoundException(`Comment not found: ${id}`);
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException("Only the author can edit this comment");
    }

    await this.db
      .update(taskComments)
      .set({ content })
      .where(eq(taskComments.id, id));

    logger.info("Comment updated", {
      "task.comment_id": id,
      "user.id": userId,
    });

    const updated = await this.db.query.taskComments.findFirst({
      where: eq(taskComments.id, id),
      with: {
        author: true,
      },
    });

    if (!updated) {
      throw new NotFoundException(`Comment not found after update: ${id}`);
    }

    return updated;
  }

  /**
   * 댓글 삭제 (소프트 삭제)
   */
  async delete(id: string, userId: string): Promise<{ success: boolean }> {
    const comment = await this.db.query.taskComments.findFirst({
      where: and(
        eq(taskComments.id, id),
        eq(taskComments.isDeleted, false),
      ),
    });

    if (!comment) {
      throw new NotFoundException(`Comment not found: ${id}`);
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException("Only the author can delete this comment");
    }

    await this.db
      .update(taskComments)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(taskComments.id, id));

    logger.info("Comment deleted", {
      "task.comment_id": id,
      "user.id": userId,
    });

    return { success: true };
  }
}
