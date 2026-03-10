import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDrizzle } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle";
import { taskLabels } from "@superbuilder/drizzle";
import { eq, asc } from "drizzle-orm";
import { createLogger } from "../../../core/logger";

const logger = createLogger("task");

@Injectable()
export class TaskLabelService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /**
   * 라벨 목록 조회
   */
  async findAll() {
    return this.db.query.taskLabels.findMany({
      orderBy: [asc(taskLabels.name)],
    });
  }

  /**
   * ID로 라벨 조회
   */
  async findById(id: string) {
    const label = await this.db.query.taskLabels.findFirst({
      where: eq(taskLabels.id, id),
    });

    if (!label) {
      throw new NotFoundException(`Label not found: ${id}`);
    }

    return label;
  }

  /**
   * 라벨 생성
   */
  async create(input: { name: string; color: string; description?: string }) {
    const rows = await this.db
      .insert(taskLabels)
      .values(input)
      .returning();

    const label = rows[0];
    if (!label) {
      throw new Error("Failed to create label record");
    }

    logger.info("Label created", {
      "task.label_id": label.id,
      "task.label_name": label.name,
    });

    return label;
  }

  /**
   * 라벨 삭제
   */
  async delete(id: string): Promise<{ success: boolean }> {
    await this.findById(id);

    await this.db.delete(taskLabels).where(eq(taskLabels.id, id));

    logger.info("Label deleted", {
      "task.label_id": id,
    });

    return { success: true };
  }
}
