import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDrizzle } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle";
import {
  taskTasks,
  taskTaskLabels,
  taskComments,
} from "@superbuilder/drizzle";
import {
  eq,
  and,
  desc,
  asc,
  count,
  like,
  inArray,
  isNull,
} from "drizzle-orm";
import { createLogger } from "../../../core/logger";
import { TaskActivityService } from "./task-activity.service";
import type { TaskListDto } from "../dto/task-list.dto";
import type { CreateTaskDto } from "../dto/create-task.dto";
import type { UpdateTaskDto } from "../dto/update-task.dto";
import type { TaskWithRelations, TaskListResult, TaskDetailResult } from "../types";

const logger = createLogger("task");

@Injectable()
export class TaskService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly activityService: TaskActivityService,
  ) {}

  /**
   * 태스크 목록 조회 (필터/정렬/페이지네이션)
   */
  async findAll(input: TaskListDto): Promise<TaskListResult> {
    const {
      status,
      priority,
      assigneeId,
      labelIds,
      projectId,
      cycleId,
      parentId,
      query,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 50,
    } = input;

    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [eq(taskTasks.isDeleted, false)];

    if (status && status.length > 0) {
      conditions.push(inArray(taskTasks.status, status));
    }
    if (priority && priority.length > 0) {
      conditions.push(inArray(taskTasks.priority, priority));
    }
    if (assigneeId !== undefined) {
      if (assigneeId === null) {
        conditions.push(isNull(taskTasks.assigneeId));
      } else {
        conditions.push(eq(taskTasks.assigneeId, assigneeId));
      }
    }
    if (projectId !== undefined) {
      if (projectId === null) {
        conditions.push(isNull(taskTasks.projectId));
      } else {
        conditions.push(eq(taskTasks.projectId, projectId));
      }
    }
    if (cycleId !== undefined) {
      if (cycleId === null) {
        conditions.push(isNull(taskTasks.cycleId));
      } else {
        conditions.push(eq(taskTasks.cycleId, cycleId));
      }
    }
    if (parentId !== undefined) {
      if (parentId === null) {
        conditions.push(isNull(taskTasks.parentId));
      } else {
        conditions.push(eq(taskTasks.parentId, parentId));
      }
    }
    if (query) {
      conditions.push(like(taskTasks.title, `%${query}%`));
    }

    const whereCondition = and(...conditions);

    // Build order by
    const sortColumn = {
      createdAt: taskTasks.createdAt,
      updatedAt: taskTasks.updatedAt,
      priority: taskTasks.priority,
      dueDate: taskTasks.dueDate,
      sortOrder: taskTasks.sortOrder,
    }[sortBy] ?? taskTasks.createdAt;

    const orderFn = sortOrder === "asc" ? asc : desc;

    // Query tasks with relations
    const tasks = await this.db.query.taskTasks.findMany({
      where: whereCondition,
      with: {
        assignee: true,
        createdBy: true,
        project: true,
        cycle: true,
        taskLabels: {
          with: {
            label: true,
          },
        },
      },
      orderBy: [orderFn(sortColumn)],
      limit,
      offset,
    });

    // Filter by labelIds if specified (post-query filtering since it's a many-to-many)
    let filteredTasks = tasks;
    if (labelIds && labelIds.length > 0) {
      filteredTasks = tasks.filter((task) =>
        labelIds.some((labelId) =>
          task.taskLabels.some((tl) => tl.labelId === labelId),
        ),
      );
    }

    // Count total
    const [totalResult] = await this.db
      .select({ count: count() })
      .from(taskTasks)
      .where(whereCondition);

    const total = totalResult?.count ?? 0;

    // Enrich with subtask/comment counts
    const enrichedTasks: TaskWithRelations[] = await Promise.all(
      filteredTasks.map(async (task) => {
        const [subtaskResult] = await this.db
          .select({ count: count() })
          .from(taskTasks)
          .where(
            and(
              eq(taskTasks.parentId, task.id),
              eq(taskTasks.isDeleted, false),
            ),
          );

        const [completedSubtaskResult] = await this.db
          .select({ count: count() })
          .from(taskTasks)
          .where(
            and(
              eq(taskTasks.parentId, task.id),
              eq(taskTasks.isDeleted, false),
              eq(taskTasks.status, "done"),
            ),
          );

        const [commentResult] = await this.db
          .select({ count: count() })
          .from(taskComments)
          .where(
            and(
              eq(taskComments.taskId, task.id),
              eq(taskComments.isDeleted, false),
            ),
          );

        return {
          ...task,
          labels: task.taskLabels.map((tl) => tl.label),
          subtaskCount: subtaskResult?.count ?? 0,
          completedSubtaskCount: completedSubtaskResult?.count ?? 0,
          commentCount: commentResult?.count ?? 0,
        } as TaskWithRelations;
      }),
    );

    return {
      tasks: enrichedTasks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 식별자로 태스크 상세 조회 (TASK-123 형식)
   */
  async findByIdentifier(identifier: string): Promise<TaskDetailResult> {
    const task = await this.db.query.taskTasks.findFirst({
      where: and(
        eq(taskTasks.identifier, identifier),
        eq(taskTasks.isDeleted, false),
      ),
      with: {
        assignee: true,
        createdBy: true,
        project: true,
        cycle: true,
        taskLabels: {
          with: {
            label: true,
          },
        },
        subtasks: {
          where: eq(taskTasks.isDeleted, false),
          orderBy: [asc(taskTasks.sortOrder)],
        },
      },
    });

    if (!task) {
      throw new NotFoundException(`Task not found: ${identifier}`);
    }

    const [subtaskResult] = await this.db
      .select({ count: count() })
      .from(taskTasks)
      .where(
        and(
          eq(taskTasks.parentId, task.id),
          eq(taskTasks.isDeleted, false),
        ),
      );

    const [completedSubtaskResult] = await this.db
      .select({ count: count() })
      .from(taskTasks)
      .where(
        and(
          eq(taskTasks.parentId, task.id),
          eq(taskTasks.isDeleted, false),
          eq(taskTasks.status, "done"),
        ),
      );

    const [commentResult] = await this.db
      .select({ count: count() })
      .from(taskComments)
      .where(
        and(
          eq(taskComments.taskId, task.id),
          eq(taskComments.isDeleted, false),
        ),
      );

    return {
      ...task,
      labels: task.taskLabels.map((tl) => tl.label),
      subtasks: task.subtasks,
      subtaskCount: subtaskResult?.count ?? 0,
      completedSubtaskCount: completedSubtaskResult?.count ?? 0,
      commentCount: commentResult?.count ?? 0,
    } as TaskDetailResult;
  }

  /**
   * ID로 태스크 조회 (내부 사용)
   */
  async findById(id: string) {
    const task = await this.db.query.taskTasks.findFirst({
      where: and(
        eq(taskTasks.id, id),
        eq(taskTasks.isDeleted, false),
      ),
    });

    if (!task) {
      throw new NotFoundException(`Task not found: ${id}`);
    }

    return task;
  }

  /**
   * 태스크 생성
   */
  async create(input: CreateTaskDto, createdById: string) {
    const { labelIds, ...taskData } = input;

    const rows = await this.db
      .insert(taskTasks)
      .values({
        ...taskData,
        identifier: `TASK-0`, // Temporary, will be updated
        createdById,
      })
      .returning();

    const task = rows[0];
    if (!task) {
      throw new Error("Failed to create task record");
    }

    // Update identifier with the auto-generated number
    const updatedRows = await this.db
      .update(taskTasks)
      .set({ identifier: `TASK-${task.number}` })
      .where(eq(taskTasks.id, task.id))
      .returning();

    const updated = updatedRows[0];
    if (!updated) {
      throw new Error("Failed to update task identifier");
    }

    // Sync labels
    if (labelIds && labelIds.length > 0) {
      await this.db.insert(taskTaskLabels).values(
        labelIds.map((labelId) => ({
          taskId: task.id,
          labelId,
        })),
      );
    }

    // Log activity
    await this.activityService.log(task.id, createdById, "created");

    logger.info("Task created", {
      "task.task_id": task.id,
      "task.identifier": updated.identifier,
      "user.id": createdById,
    });

    return this.findByIdentifier(updated.identifier);
  }

  /**
   * 태스크 수정
   */
  async update(id: string, input: UpdateTaskDto, actorId: string) {
    const existing = await this.findById(id);
    const { labelIds, ...updateData } = input;

    // Detect changes and log activities
    if (input.status !== undefined && input.status !== existing.status) {
      await this.activityService.log(id, actorId, "status_changed", {
        fromValue: existing.status,
        toValue: input.status,
      });
    }

    if (input.priority !== undefined && input.priority !== existing.priority) {
      await this.activityService.log(id, actorId, "priority_changed", {
        fromValue: String(existing.priority),
        toValue: String(input.priority),
      });
    }

    if (input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId) {
      if (input.assigneeId) {
        await this.activityService.log(id, actorId, "assigned", {
          fromValue: existing.assigneeId,
          toValue: input.assigneeId,
        });
      } else {
        await this.activityService.log(id, actorId, "unassigned", {
          fromValue: existing.assigneeId,
        });
      }
    }

    if (input.projectId !== undefined && input.projectId !== existing.projectId) {
      await this.activityService.log(id, actorId, "project_changed", {
        fromValue: existing.projectId,
        toValue: input.projectId,
      });
    }

    if (input.cycleId !== undefined && input.cycleId !== existing.cycleId) {
      await this.activityService.log(id, actorId, "cycle_changed", {
        fromValue: existing.cycleId,
        toValue: input.cycleId,
      });
    }

    if (input.estimate !== undefined && input.estimate !== existing.estimate) {
      await this.activityService.log(id, actorId, "estimate_changed", {
        fromValue: existing.estimate != null ? String(existing.estimate) : null,
        toValue: input.estimate != null ? String(input.estimate) : null,
      });
    }

    if (input.dueDate !== undefined && input.dueDate !== existing.dueDate) {
      await this.activityService.log(id, actorId, "due_date_changed", {
        fromValue: existing.dueDate,
        toValue: input.dueDate,
      });
    }

    if (input.title !== undefined && input.title !== existing.title) {
      await this.activityService.log(id, actorId, "title_changed", {
        fromValue: existing.title,
        toValue: input.title,
      });
    }

    if (input.description !== undefined && input.description !== existing.description) {
      await this.activityService.log(id, actorId, "description_changed");
    }

    if (input.parentId !== undefined && input.parentId !== existing.parentId) {
      await this.activityService.log(id, actorId, "parent_changed", {
        fromValue: existing.parentId,
        toValue: input.parentId,
      });
    }

    // Handle status -> completedAt
    const setData: Record<string, unknown> = { ...updateData };
    if (input.status === "done" && existing.status !== "done") {
      setData.completedAt = new Date();
    } else if (input.status !== undefined && input.status !== "done" && existing.status === "done") {
      setData.completedAt = null;
    }

    await this.db
      .update(taskTasks)
      .set(setData)
      .where(eq(taskTasks.id, id));

    // Sync labels if provided
    if (labelIds !== undefined) {
      // Get current labels
      const currentLabels = await this.db.query.taskTaskLabels.findMany({
        where: eq(taskTaskLabels.taskId, id),
      });
      const currentLabelIds = currentLabels.map((tl) => tl.labelId);

      // Labels to add
      const toAdd = labelIds.filter((labelId) => !currentLabelIds.includes(labelId));
      // Labels to remove
      const toRemove = currentLabelIds.filter((labelId) => !labelIds.includes(labelId));

      if (toAdd.length > 0) {
        await this.db.insert(taskTaskLabels).values(
          toAdd.map((labelId) => ({ taskId: id, labelId })),
        );
        for (const labelId of toAdd) {
          await this.activityService.log(id, actorId, "label_added", {
            toValue: labelId,
          });
        }
      }

      if (toRemove.length > 0) {
        for (const labelId of toRemove) {
          await this.db
            .delete(taskTaskLabels)
            .where(
              and(
                eq(taskTaskLabels.taskId, id),
                eq(taskTaskLabels.labelId, labelId),
              ),
            );
          await this.activityService.log(id, actorId, "label_removed", {
            fromValue: labelId,
          });
        }
      }
    }

    logger.info("Task updated", {
      "task.task_id": id,
      "user.id": actorId,
    });

    return this.findByIdentifier(existing.identifier);
  }

  /**
   * 태스크 삭제 (소프트 삭제)
   */
  async delete(id: string, actorId: string): Promise<{ success: boolean }> {
    await this.findById(id);

    await this.db
      .update(taskTasks)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(taskTasks.id, id));

    await this.activityService.log(id, actorId, "status_changed", {
      toValue: "deleted",
    });

    logger.info("Task deleted", {
      "task.task_id": id,
      "user.id": actorId,
    });

    return { success: true };
  }

  /**
   * 태스크 순서 및 상태 일괄 업데이트 (칸반 D&D)
   */
  async bulkUpdateOrder(
    updates: Array<{ id: string; status?: string; sortOrder: number }>,
    actorId: string,
  ): Promise<{ success: boolean; updated: number }> {
    const statusChanges: Array<{
      taskId: string;
      fromStatus: string;
      toStatus: string;
    }> = [];
    let updatedCount = 0;

    await this.db.transaction(async (tx) => {
      for (const item of updates) {
        if (item.status) {
          const existing = await tx.query.taskTasks.findFirst({
            where: and(
              eq(taskTasks.id, item.id),
              eq(taskTasks.isDeleted, false),
            ),
          });

          if (!existing) continue;

          const updateData: Record<string, unknown> = {
            sortOrder: item.sortOrder,
          };

          if (item.status !== existing.status) {
            updateData.status = item.status;
            if (item.status === "done") {
              updateData.completedAt = new Date();
            } else if (existing.status === "done") {
              updateData.completedAt = null;
            }
            statusChanges.push({
              taskId: item.id,
              fromStatus: existing.status,
              toStatus: item.status,
            });
          }

          await tx
            .update(taskTasks)
            .set(updateData)
            .where(eq(taskTasks.id, item.id));
        } else {
          await tx
            .update(taskTasks)
            .set({ sortOrder: item.sortOrder })
            .where(eq(taskTasks.id, item.id));
        }

        updatedCount++;
      }
    });

    // Log activity for status changes (outside transaction since activityService uses its own db)
    for (const change of statusChanges) {
      await this.activityService.log(
        change.taskId,
        actorId,
        "status_changed",
        {
          fromValue: change.fromStatus,
          toValue: change.toStatus,
        },
      );
    }

    logger.info("Tasks bulk order updated", {
      "task.update_count": updatedCount,
      "user.id": actorId,
    });

    return { success: true, updated: updatedCount };
  }
}
