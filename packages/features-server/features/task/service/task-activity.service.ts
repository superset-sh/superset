import { Injectable } from "@nestjs/common";
import { InjectDrizzle } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle";
import { taskActivities } from "@superbuilder/drizzle";
import { eq, desc } from "drizzle-orm";
import { createLogger } from "../../../core/logger";

const logger = createLogger("task");

interface LogActivityOptions {
  fromValue?: string | null;
  toValue?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class TaskActivityService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /**
   * 태스크 활동 기록
   */
  async log(
    taskId: string,
    actorId: string,
    action: (typeof taskActivities.action.enumValues)[number],
    options?: LogActivityOptions,
  ) {
    const rows = await this.db
      .insert(taskActivities)
      .values({
        taskId,
        actorId,
        action,
        fromValue: options?.fromValue ?? null,
        toValue: options?.toValue ?? null,
        metadata: options?.metadata ?? null,
      })
      .returning();

    const activity = rows[0];
    if (!activity) {
      throw new Error("Failed to create activity record");
    }

    logger.info("Task activity logged", {
      "task.task_id": taskId,
      "task.action": action,
      "user.id": actorId,
    });

    return activity;
  }

  /**
   * 태스크별 활동 이력 조회
   */
  async findByTaskId(taskId: string) {
    return this.db.query.taskActivities.findMany({
      where: eq(taskActivities.taskId, taskId),
      with: {
        actor: true,
      },
      orderBy: [desc(taskActivities.createdAt)],
    });
  }
}
