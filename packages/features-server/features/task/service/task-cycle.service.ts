import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDrizzle } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle";
import { taskCycles } from "@superbuilder/drizzle";
import { eq, desc } from "drizzle-orm";
import { createLogger } from "../../../core/logger";

const logger = createLogger("task");

@Injectable()
export class TaskCycleService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /**
   * 사이클 목록 조회
   */
  async findAll() {
    return this.db.query.taskCycles.findMany({
      with: {
        createdBy: true,
      },
      orderBy: [desc(taskCycles.createdAt)],
    });
  }

  /**
   * ID로 사이클 조회
   */
  async findById(id: string) {
    const cycle = await this.db.query.taskCycles.findFirst({
      where: eq(taskCycles.id, id),
      with: {
        createdBy: true,
      },
    });

    if (!cycle) {
      throw new NotFoundException(`Cycle not found: ${id}`);
    }

    return cycle;
  }

  /**
   * 사이클 생성
   */
  async create(
    input: {
      name?: string;
      startDate: string;
      endDate: string;
      status?: "active" | "completed";
    },
    createdById: string,
  ) {
    const rows = await this.db
      .insert(taskCycles)
      .values({
        ...input,
        createdById,
      })
      .returning();

    const cycle = rows[0];
    if (!cycle) {
      throw new Error("Failed to create cycle record");
    }

    logger.info("Cycle created", {
      "task.cycle_id": cycle.id,
      "user.id": createdById,
    });

    return this.findById(cycle.id);
  }

  /**
   * 사이클 수정
   */
  async update(
    id: string,
    input: {
      name?: string;
      startDate?: string;
      endDate?: string;
      status?: "active" | "completed";
    },
  ) {
    await this.findById(id);

    await this.db
      .update(taskCycles)
      .set(input)
      .where(eq(taskCycles.id, id));

    logger.info("Cycle updated", {
      "task.cycle_id": id,
    });

    return this.findById(id);
  }
}
