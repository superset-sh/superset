import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { eq, desc, asc, and, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import { boards, boardPosts } from "@superbuilder/drizzle";
import type { CreateBoardInput, UpdateBoardInput, BoardWithStats } from "../types";

@Injectable()
export class BoardService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>
  ) {}

  /**
   * 모든 게시판 목록 조회
   */
  async findAll(includeInactive = false): Promise<BoardWithStats[]> {
    const conditions = includeInactive ? [] : [eq(boards.isActive, true)];

    const result = await this.db
      .select({
        id: boards.id,
        name: boards.name,
        slug: boards.slug,
        type: boards.type,
        description: boards.description,
        settings: boards.settings,
        isActive: boards.isActive,
        order: boards.order,
        createdAt: boards.createdAt,
        updatedAt: boards.updatedAt,
        postCount: sql<number>`(
          SELECT COUNT(*) FROM ${boardPosts}
          WHERE ${boardPosts.boardId} = ${boards.id}
          AND ${boardPosts.status} = 'published'
        )`.as("post_count"),
      })
      .from(boards)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(boards.order), desc(boards.createdAt));

    return result as BoardWithStats[];
  }

  /**
   * ID로 게시판 조회
   */
  async findById(id: string): Promise<BoardWithStats | null> {
    const [result] = await this.db
      .select({
        id: boards.id,
        name: boards.name,
        slug: boards.slug,
        type: boards.type,
        description: boards.description,
        settings: boards.settings,
        isActive: boards.isActive,
        order: boards.order,
        createdAt: boards.createdAt,
        updatedAt: boards.updatedAt,
        postCount: sql<number>`(
          SELECT COUNT(*) FROM ${boardPosts}
          WHERE ${boardPosts.boardId} = ${boards.id}
          AND ${boardPosts.status} = 'published'
        )`.as("post_count"),
      })
      .from(boards)
      .where(eq(boards.id, id))
      .limit(1);

    return (result as BoardWithStats) ?? null;
  }

  /**
   * Slug로 게시판 조회
   */
  async findBySlug(slug: string): Promise<BoardWithStats | null> {
    const [result] = await this.db
      .select({
        id: boards.id,
        name: boards.name,
        slug: boards.slug,
        type: boards.type,
        description: boards.description,
        settings: boards.settings,
        isActive: boards.isActive,
        order: boards.order,
        createdAt: boards.createdAt,
        updatedAt: boards.updatedAt,
        postCount: sql<number>`(
          SELECT COUNT(*) FROM ${boardPosts}
          WHERE ${boardPosts.boardId} = ${boards.id}
          AND ${boardPosts.status} = 'published'
        )`.as("post_count"),
      })
      .from(boards)
      .where(eq(boards.slug, slug))
      .limit(1);

    return (result as BoardWithStats) ?? null;
  }

  /**
   * 게시판 생성
   */
  async create(input: CreateBoardInput): Promise<BoardWithStats> {
    const [created] = await this.db
      .insert(boards)
      .values({
        name: input.name,
        slug: input.slug,
        type: input.type ?? "general",
        description: input.description,
        settings: input.settings ?? {},
        isActive: input.isActive ?? true,
        order: input.order ?? 0,
      })
      .returning();

    return { ...created, postCount: 0 } as BoardWithStats;
  }

  /**
   * 게시판 수정
   */
  async update(id: string, input: UpdateBoardInput): Promise<BoardWithStats> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Board with id ${id} not found`);
    }

    const [updated] = await this.db
      .update(boards)
      .set({
        ...(input.name && { name: input.name }),
        ...(input.slug && { slug: input.slug }),
        ...(input.type && { type: input.type }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.settings && { settings: input.settings }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.order !== undefined && { order: input.order }),
      })
      .where(eq(boards.id, id))
      .returning();

    return { ...updated, postCount: existing.postCount } as BoardWithStats;
  }

  /**
   * 게시판 삭제
   */
  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Board with id ${id} not found`);
    }

    await this.db.delete(boards).where(eq(boards.id, id));
  }
}
