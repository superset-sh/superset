import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { InjectDrizzle } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle";
import { taskProjects } from "@superbuilder/drizzle";
import { eq, and, desc } from "drizzle-orm";
import { createLogger } from "../../../core/logger";

const logger = createLogger("task");

@Injectable()
export class TaskProjectService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /**
   * 프로젝트 목록 조회
   */
  async findAll() {
    return this.db.query.taskProjects.findMany({
      where: eq(taskProjects.isDeleted, false),
      with: {
        createdBy: true,
      },
      orderBy: [desc(taskProjects.createdAt)],
    });
  }

  /**
   * ID로 프로젝트 조회
   */
  async findById(id: string) {
    const project = await this.db.query.taskProjects.findFirst({
      where: and(
        eq(taskProjects.id, id),
        eq(taskProjects.isDeleted, false),
      ),
      with: {
        createdBy: true,
      },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${id}`);
    }

    return project;
  }

  /**
   * 프로젝트 생성
   */
  async create(
    input: {
      name: string;
      description?: string;
      icon?: string;
      color?: string;
      status?: "planned" | "started" | "paused" | "completed" | "canceled";
      startDate?: string;
      targetDate?: string;
    },
    createdById: string,
  ) {
    const slug = this.generateSlug(input.name);

    // Check slug uniqueness
    const existing = await this.db.query.taskProjects.findFirst({
      where: eq(taskProjects.slug, slug),
    });

    if (existing) {
      throw new ConflictException(`Project slug already exists: ${slug}`);
    }

    const rows = await this.db
      .insert(taskProjects)
      .values({
        ...input,
        slug,
        createdById,
      })
      .returning();

    const project = rows[0];
    if (!project) {
      throw new Error("Failed to create project record");
    }

    logger.info("Project created", {
      "task.project_id": project.id,
      "task.project_slug": slug,
      "user.id": createdById,
    });

    return this.findById(project.id);
  }

  /**
   * 프로젝트 수정
   */
  async update(
    id: string,
    input: {
      name?: string;
      description?: string;
      icon?: string;
      color?: string;
      status?: "planned" | "started" | "paused" | "completed" | "canceled";
      startDate?: string;
      targetDate?: string;
    },
  ) {
    await this.findById(id);

    const updateData: Record<string, unknown> = { ...input };

    if (input.name) {
      updateData.slug = this.generateSlug(input.name);
    }

    await this.db
      .update(taskProjects)
      .set(updateData)
      .where(eq(taskProjects.id, id));

    logger.info("Project updated", {
      "task.project_id": id,
    });

    return this.findById(id);
  }

  /**
   * 프로젝트 삭제 (소프트 삭제)
   */
  async delete(id: string): Promise<{ success: boolean }> {
    await this.findById(id);

    await this.db
      .update(taskProjects)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(taskProjects.id, id));

    logger.info("Project deleted", {
      "task.project_id": id,
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
