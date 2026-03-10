import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { eq, desc, asc, and, count, sql, ilike, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import {
  courseCourses,
  courseTopics,
  courseSections,
  courseLessons,
  courseEnrollments,
} from "@superbuilder/drizzle";
import type { Course } from "@superbuilder/drizzle";
import type {
  CreateCourseInput,
  UpdateCourseInput,
  CourseWithTopic,
  PaginatedResult,
  PaginationInput,
} from "../types";

@Injectable()
export class CourseService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>,
  ) {}

  async findPublished(
    input: PaginationInput & { topicId?: string; sort?: string },
  ): Promise<PaginatedResult<CourseWithTopic>> {
    const { topicId, sort } = input;
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions = [
      eq(courseCourses.status, "published"),
    ];
    if (topicId) {
      conditions.push(eq(courseCourses.topicId, topicId));
    }

    const whereClause = and(...conditions);

    const [totalResult, data] = await Promise.all([
      this.db.select({ total: count() }).from(courseCourses).where(whereClause),
      this.db
        .select({
          id: courseCourses.id,
          topicId: courseCourses.topicId,
          title: courseCourses.title,
          slug: courseCourses.slug,
          summary: courseCourses.summary,
          content: courseCourses.content,
          thumbnailUrl: courseCourses.thumbnailUrl,
          status: courseCourses.status,
          authorId: courseCourses.authorId,
          totalLessons: courseCourses.totalLessons,
          estimatedMinutes: courseCourses.estimatedMinutes,
          sortOrder: courseCourses.sortOrder,
          publishedAt: courseCourses.publishedAt,
          createdAt: courseCourses.createdAt,
          updatedAt: courseCourses.updatedAt,
          topic: {
            id: courseTopics.id,
            name: courseTopics.name,
            slug: courseTopics.slug,
          },
          enrollmentCount: sql<number>`(
            SELECT COUNT(*) FROM ${courseEnrollments}
            WHERE ${courseEnrollments.courseId} = ${courseCourses.id}
          )`.as("enrollment_count"),
        })
        .from(courseCourses)
        .innerJoin(courseTopics, eq(courseCourses.topicId, courseTopics.id))
        .where(whereClause)
        .orderBy(
          sort === "latest" ? desc(courseCourses.publishedAt) : asc(courseCourses.sortOrder),
        )
        .limit(limit)
        .offset(offset),
    ]);

    const total = totalResult[0]?.total ?? 0;

    return {
      items: data as unknown as CourseWithTopic[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findBySlug(slug: string): Promise<CourseWithTopic> {
    const [course] = await this.db
      .select({
        id: courseCourses.id,
        topicId: courseCourses.topicId,
        title: courseCourses.title,
        slug: courseCourses.slug,
        summary: courseCourses.summary,
        content: courseCourses.content,
        thumbnailUrl: courseCourses.thumbnailUrl,
        status: courseCourses.status,
        authorId: courseCourses.authorId,
        totalLessons: courseCourses.totalLessons,
        estimatedMinutes: courseCourses.estimatedMinutes,
        sortOrder: courseCourses.sortOrder,
        publishedAt: courseCourses.publishedAt,
        createdAt: courseCourses.createdAt,
        updatedAt: courseCourses.updatedAt,
        topic: {
          id: courseTopics.id,
          name: courseTopics.name,
          slug: courseTopics.slug,
        },
        enrollmentCount: sql<number>`(
          SELECT COUNT(*) FROM ${courseEnrollments}
          WHERE ${courseEnrollments.courseId} = ${courseCourses.id}
        )`.as("enrollment_count"),
      })
      .from(courseCourses)
      .innerJoin(courseTopics, eq(courseCourses.topicId, courseTopics.id))
      .where(and(eq(courseCourses.slug, slug), eq(courseCourses.status, "published")))
      .limit(1);

    if (!course) {
      throw new NotFoundException(`Course not found: ${slug}`);
    }

    return course as unknown as CourseWithTopic;
  }

  async findById(id: string): Promise<CourseWithTopic> {
    const [course] = await this.db
      .select({
        id: courseCourses.id,
        topicId: courseCourses.topicId,
        title: courseCourses.title,
        slug: courseCourses.slug,
        summary: courseCourses.summary,
        content: courseCourses.content,
        thumbnailUrl: courseCourses.thumbnailUrl,
        status: courseCourses.status,
        authorId: courseCourses.authorId,
        totalLessons: courseCourses.totalLessons,
        estimatedMinutes: courseCourses.estimatedMinutes,
        sortOrder: courseCourses.sortOrder,
        publishedAt: courseCourses.publishedAt,
        createdAt: courseCourses.createdAt,
        updatedAt: courseCourses.updatedAt,
        topic: {
          id: courseTopics.id,
          name: courseTopics.name,
          slug: courseTopics.slug,
        },
        enrollmentCount: sql<number>`(
          SELECT COUNT(*) FROM ${courseEnrollments}
          WHERE ${courseEnrollments.courseId} = ${courseCourses.id}
        )`.as("enrollment_count"),
      })
      .from(courseCourses)
      .innerJoin(courseTopics, eq(courseCourses.topicId, courseTopics.id))
      .where(eq(courseCourses.id, id))
      .limit(1);

    if (!course) {
      throw new NotFoundException(`Course not found: ${id}`);
    }

    return course as unknown as CourseWithTopic;
  }

  async adminList(
    input: PaginationInput & { status?: string; topicId?: string; search?: string },
  ): Promise<PaginatedResult<CourseWithTopic>> {
    const { status, topicId, search } = input;
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];
    if (status) {
      conditions.push(eq(courseCourses.status, status as "draft" | "published"));
    }
    if (topicId) {
      conditions.push(eq(courseCourses.topicId, topicId));
    }
    if (search) {
      conditions.push(ilike(courseCourses.title, `%${search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult, data] = await Promise.all([
      this.db.select({ total: count() }).from(courseCourses).where(whereClause),
      this.db
        .select({
          id: courseCourses.id,
          topicId: courseCourses.topicId,
          title: courseCourses.title,
          slug: courseCourses.slug,
          summary: courseCourses.summary,
          content: courseCourses.content,
          thumbnailUrl: courseCourses.thumbnailUrl,
          status: courseCourses.status,
          authorId: courseCourses.authorId,
          totalLessons: courseCourses.totalLessons,
          estimatedMinutes: courseCourses.estimatedMinutes,
          sortOrder: courseCourses.sortOrder,
          publishedAt: courseCourses.publishedAt,
          createdAt: courseCourses.createdAt,
          updatedAt: courseCourses.updatedAt,
          topic: {
            id: courseTopics.id,
            name: courseTopics.name,
            slug: courseTopics.slug,
          },
          enrollmentCount: sql<number>`(
            SELECT COUNT(*) FROM ${courseEnrollments}
            WHERE ${courseEnrollments.courseId} = ${courseCourses.id}
          )`.as("enrollment_count"),
        })
        .from(courseCourses)
        .innerJoin(courseTopics, eq(courseCourses.topicId, courseTopics.id))
        .where(whereClause)
        .orderBy(desc(courseCourses.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    const total = totalResult[0]?.total ?? 0;

    return {
      items: data as unknown as CourseWithTopic[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(input: CreateCourseInput, authorId: string): Promise<Course> {
    const slug = this.generateSlug(input.title);

    const [maxOrder] = await this.db
      .select({ max: sql<number>`COALESCE(MAX(${courseCourses.sortOrder}), -1)` })
      .from(courseCourses)
      .where(eq(courseCourses.topicId, input.topicId));

    const [created] = await this.db
      .insert(courseCourses)
      .values({
        topicId: input.topicId,
        title: input.title,
        slug,
        summary: input.summary,
        content: input.content,
        thumbnailUrl: input.thumbnailUrl,
        estimatedMinutes: input.estimatedMinutes,
        authorId,
        sortOrder: (maxOrder?.max ?? -1) + 1,
      })
      .returning();

    return created!;
  }

  async update(id: string, input: UpdateCourseInput): Promise<Course> {
    const existing = await this.findById(id);

    const updateData: Record<string, unknown> = {};
    if (input.topicId !== undefined) updateData.topicId = input.topicId;
    if (input.title !== undefined) {
      updateData.title = input.title;
      if (!input.slug && input.title !== existing.title) {
        updateData.slug = this.generateSlug(input.title);
      }
    }
    if (input.slug !== undefined) updateData.slug = input.slug;
    if (input.summary !== undefined) updateData.summary = input.summary;
    if (input.content !== undefined) updateData.content = input.content;
    if (input.thumbnailUrl !== undefined) updateData.thumbnailUrl = input.thumbnailUrl;
    if (input.estimatedMinutes !== undefined) updateData.estimatedMinutes = input.estimatedMinutes;
    if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;

    const [updated] = await this.db
      .update(courseCourses)
      .set(updateData)
      .where(eq(courseCourses.id, id))
      .returning();

    return updated!;
  }

  async delete(id: string): Promise<{ success: boolean }> {
    await this.findById(id);
    await this.db.delete(courseCourses).where(eq(courseCourses.id, id));
    return { success: true };
  }

  async publish(id: string): Promise<Course> {
    await this.findById(id);

    const sections = await this.db
      .select({ id: courseSections.id })
      .from(courseSections)
      .where(eq(courseSections.courseId, id));

    if (sections.length === 0) {
      throw new BadRequestException("발행하려면 최소 1개 섹션이 필요합니다");
    }

    let hasLesson = false;
    for (const section of sections) {
      const [lessonCount] = await this.db
        .select({ total: count() })
        .from(courseLessons)
        .where(eq(courseLessons.sectionId, section.id));
      if ((lessonCount?.total ?? 0) > 0) {
        hasLesson = true;
        break;
      }
    }

    if (!hasLesson) {
      throw new BadRequestException("발행하려면 최소 1개 레슨이 필요합니다");
    }

    const [updated] = await this.db
      .update(courseCourses)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(courseCourses.id, id))
      .returning();

    return updated!;
  }

  async unpublish(id: string): Promise<Course> {
    await this.findById(id);

    const [updated] = await this.db
      .update(courseCourses)
      .set({ status: "draft" })
      .where(eq(courseCourses.id, id))
      .returning();

    return updated!;
  }

  async updateTotalLessons(courseId: string): Promise<void> {
    const sections = await this.db
      .select({ id: courseSections.id })
      .from(courseSections)
      .where(eq(courseSections.courseId, courseId));

    if (sections.length === 0) {
      await this.db
        .update(courseCourses)
        .set({ totalLessons: 0 })
        .where(eq(courseCourses.id, courseId));
      return;
    }

    const sectionIds = sections.map((s) => s.id);
    const [lessonCount] = await this.db
      .select({ total: count() })
      .from(courseLessons)
      .where(sql`${courseLessons.sectionId} IN (${sql.join(sectionIds.map(id => sql`${id}`), sql`, `)})`);

    await this.db
      .update(courseCourses)
      .set({ totalLessons: lessonCount?.total ?? 0 })
      .where(eq(courseCourses.id, courseId));
  }

  private generateSlug(title: string): string {
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return `${baseSlug}-${Date.now().toString(36)}`;
  }
}
