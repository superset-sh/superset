import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { eq, and, count, desc, sql, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import {
  courseEnrollments,
  courseCourses,
  courseSections,
  courseLessons,
  courseLessonProgress,
  courseTopics,
  profiles,
} from "@superbuilder/drizzle";
import type { CourseEnrollment } from "@superbuilder/drizzle";
import type {
  EnrollmentWithProgress,
  MyCourseWithProgress,
  PaginatedResult,
  PaginationInput,
  UpdateProgressInput,
  CourseProgressDetail,
} from "../types";

@Injectable()
export class EnrollmentService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>,
  ) {}

  async enroll(courseId: string, userId: string): Promise<CourseEnrollment> {
    const [course] = await this.db
      .select()
      .from(courseCourses)
      .where(eq(courseCourses.id, courseId))
      .limit(1);

    if (!course) {
      throw new NotFoundException(`Course not found: ${courseId}`);
    }

    if (course.status !== "published") {
      throw new BadRequestException("발행된 강의만 수강 신청할 수 있습니다");
    }

    const [existing] = await this.db
      .select()
      .from(courseEnrollments)
      .where(
        and(
          eq(courseEnrollments.courseId, courseId),
          eq(courseEnrollments.userId, userId),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictException("이미 수강 중인 강의입니다");
    }

    const [created] = await this.db
      .insert(courseEnrollments)
      .values({ courseId, userId })
      .returning();

    return created!;
  }

  async cancel(courseId: string, userId: string): Promise<{ success: boolean }> {
    const [enrollment] = await this.db
      .select()
      .from(courseEnrollments)
      .where(
        and(
          eq(courseEnrollments.courseId, courseId),
          eq(courseEnrollments.userId, userId),
        ),
      )
      .limit(1);

    if (!enrollment) {
      throw new NotFoundException("수강 신청 내역이 없습니다");
    }

    // 해당 강의의 레슨 ID만 조회하여 해당 강의 진행률만 삭제
    const courseLessonIds = this.db
      .select({ id: courseLessons.id })
      .from(courseLessons)
      .innerJoin(courseSections, eq(courseLessons.sectionId, courseSections.id))
      .where(eq(courseSections.courseId, courseId));

    await this.db
      .delete(courseLessonProgress)
      .where(
        and(
          eq(courseLessonProgress.userId, userId),
          inArray(courseLessonProgress.lessonId, courseLessonIds),
        ),
      );

    await this.db
      .delete(courseEnrollments)
      .where(eq(courseEnrollments.id, enrollment.id));

    return { success: true };
  }

  async isEnrolled(courseId: string, userId: string): Promise<boolean> {
    const [enrollment] = await this.db
      .select({ id: courseEnrollments.id })
      .from(courseEnrollments)
      .where(
        and(
          eq(courseEnrollments.courseId, courseId),
          eq(courseEnrollments.userId, userId),
        ),
      )
      .limit(1);

    return !!enrollment;
  }

  async myCourses(userId: string): Promise<MyCourseWithProgress[]> {
    const enrollments = await this.db
      .select({
        enrollment: courseEnrollments,
        course: {
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
        },
        topic: {
          id: courseTopics.id,
          name: courseTopics.name,
          slug: courseTopics.slug,
        },
      })
      .from(courseEnrollments)
      .innerJoin(courseCourses, eq(courseEnrollments.courseId, courseCourses.id))
      .innerJoin(courseTopics, eq(courseCourses.topicId, courseTopics.id))
      .where(eq(courseEnrollments.userId, userId))
      .orderBy(desc(courseEnrollments.enrolledAt));

    const result: MyCourseWithProgress[] = [];
    for (const row of enrollments) {
      // 해당 강의의 완료 레슨 수만 정확히 카운트 (courseId 필터 적용)
      const [progressCount] = await this.db
        .select({ completed: count() })
        .from(courseLessonProgress)
        .innerJoin(courseLessons, eq(courseLessonProgress.lessonId, courseLessons.id))
        .innerJoin(courseSections, eq(courseLessons.sectionId, courseSections.id))
        .where(
          and(
            eq(courseLessonProgress.userId, userId),
            eq(courseLessonProgress.isCompleted, true),
            eq(courseSections.courseId, row.course.id),
          ),
        );

      const completedLessons = progressCount?.completed ?? 0;
      const totalLessons = row.course.totalLessons;
      const progressPercent = totalLessons > 0
        ? Math.floor((completedLessons / totalLessons) * 100)
        : 0;

      result.push({
        course: { ...row.course, topic: row.topic } as MyCourseWithProgress["course"],
        enrollment: row.enrollment,
        completedLessons,
        totalLessons,
        progressPercent,
      });
    }

    return result;
  }

  async adminList(
    courseId: string,
    input: PaginationInput,
  ): Promise<PaginatedResult<EnrollmentWithProgress>> {
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));
    const offset = (page - 1) * limit;

    const whereClause = eq(courseEnrollments.courseId, courseId);

    const [totalResult, data] = await Promise.all([
      this.db.select({ total: count() }).from(courseEnrollments).where(whereClause),
      this.db
        .select({
          id: courseEnrollments.id,
          courseId: courseEnrollments.courseId,
          userId: courseEnrollments.userId,
          enrolledAt: courseEnrollments.enrolledAt,
          completedAt: courseEnrollments.completedAt,
          createdAt: courseEnrollments.createdAt,
          updatedAt: courseEnrollments.updatedAt,
          profile: {
            id: profiles.id,
            name: profiles.name,
            email: profiles.email,
            avatar: profiles.avatar,
          },
        })
        .from(courseEnrollments)
        .innerJoin(profiles, eq(courseEnrollments.userId, profiles.id))
        .where(whereClause)
        .orderBy(desc(courseEnrollments.enrolledAt))
        .limit(limit)
        .offset(offset),
    ]);

    const total = totalResult[0]?.total ?? 0;

    const items: EnrollmentWithProgress[] = [];
    for (const row of data) {
      // 해당 강의의 진행률만 계산 (courseId 필터 적용)
      const [progressResult] = await this.db
        .select({
          avgPercent: sql<number>`COALESCE(AVG(${courseLessonProgress.progressPercent}), 0)`,
          lastActivity: sql<Date | null>`MAX(${courseLessonProgress.updatedAt})`,
        })
        .from(courseLessonProgress)
        .innerJoin(courseLessons, eq(courseLessonProgress.lessonId, courseLessons.id))
        .innerJoin(courseSections, eq(courseLessons.sectionId, courseSections.id))
        .where(
          and(
            eq(courseLessonProgress.userId, row.userId),
            eq(courseSections.courseId, courseId),
          ),
        );

      items.push({
        ...row,
        progressPercent: Math.floor(progressResult?.avgPercent ?? 0),
        lastActivityAt: progressResult?.lastActivity ?? null,
      } as EnrollmentWithProgress);
    }

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async toggleLessonComplete(
    lessonId: string,
    userId: string,
    completed: boolean,
  ): Promise<{ lessonId: string; completed: boolean }> {
    const [existing] = await this.db
      .select()
      .from(courseLessonProgress)
      .where(
        and(
          eq(courseLessonProgress.lessonId, lessonId),
          eq(courseLessonProgress.userId, userId),
        ),
      )
      .limit(1);

    if (existing) {
      await this.db
        .update(courseLessonProgress)
        .set({
          isCompleted: completed,
          progressPercent: completed ? 100 : existing.progressPercent,
          ...(completed && !existing.isCompleted ? { completedAt: new Date() } : {}),
          ...(!completed ? { completedAt: null } : {}),
        })
        .where(eq(courseLessonProgress.id, existing.id));
    } else {
      await this.db.insert(courseLessonProgress).values({
        lessonId,
        userId,
        watchedSeconds: 0,
        totalSeconds: 0,
        progressPercent: completed ? 100 : 0,
        lastPosition: 0,
        isCompleted: completed,
        ...(completed ? { completedAt: new Date() } : {}),
      });
    }

    if (completed) {
      await this.checkCourseCompletion(lessonId, userId);
    }

    return { lessonId, completed };
  }

  async updateProgress(input: UpdateProgressInput, userId: string): Promise<void> {
    const { lessonId, currentPosition, totalDuration } = input;

    const [existing] = await this.db
      .select()
      .from(courseLessonProgress)
      .where(
        and(
          eq(courseLessonProgress.lessonId, lessonId),
          eq(courseLessonProgress.userId, userId),
        ),
      )
      .limit(1);

    const watchedSeconds = Math.max(existing?.watchedSeconds ?? 0, currentPosition);
    const totalSeconds = totalDuration;
    const progressPercent = totalSeconds > 0
      ? Math.min(Math.floor((watchedSeconds / totalSeconds) * 100), 100)
      : 0;
    const isCompleted = progressPercent >= 90;

    if (existing) {
      await this.db
        .update(courseLessonProgress)
        .set({
          watchedSeconds,
          totalSeconds,
          progressPercent,
          lastPosition: currentPosition,
          isCompleted,
          ...(isCompleted && !existing.isCompleted ? { completedAt: new Date() } : {}),
        })
        .where(eq(courseLessonProgress.id, existing.id));
    } else {
      await this.db.insert(courseLessonProgress).values({
        lessonId,
        userId,
        watchedSeconds,
        totalSeconds,
        progressPercent,
        lastPosition: currentPosition,
        isCompleted,
        ...(isCompleted ? { completedAt: new Date() } : {}),
      });
    }

    if (isCompleted) {
      await this.checkCourseCompletion(lessonId, userId);
    }
  }

  async getCourseProgress(courseId: string, userId: string): Promise<CourseProgressDetail> {
    const sections = await this.db
      .select()
      .from(courseSections)
      .where(eq(courseSections.courseId, courseId))
      .orderBy(courseSections.sortOrder);

    let totalLessons = 0;
    let completedLessons = 0;
    const sectionDetails: CourseProgressDetail["sections"] = [];

    for (const section of sections) {
      const lessons = await this.db
        .select()
        .from(courseLessons)
        .where(eq(courseLessons.sectionId, section.id))
        .orderBy(courseLessons.sortOrder);

      let sectionCompleted = 0;
      const lessonDetails: CourseProgressDetail["sections"][0]["lessons"] = [];

      for (const lesson of lessons) {
        const [progress] = await this.db
          .select()
          .from(courseLessonProgress)
          .where(
            and(
              eq(courseLessonProgress.lessonId, lesson.id),
              eq(courseLessonProgress.userId, userId),
            ),
          )
          .limit(1);

        const isComplete = progress?.isCompleted ?? false;
        if (isComplete) {
          sectionCompleted++;
          completedLessons++;
        }
        totalLessons++;

        lessonDetails.push({
          id: lesson.id,
          title: lesson.title,
          progressPercent: progress?.progressPercent ?? 0,
          isCompleted: isComplete,
          lastPosition: progress?.lastPosition ?? 0,
        });
      }

      sectionDetails.push({
        id: section.id,
        title: section.title,
        completedLessons: sectionCompleted,
        totalLessons: lessons.length,
        percent: lessons.length > 0
          ? Math.floor((sectionCompleted / lessons.length) * 100)
          : 0,
        lessons: lessonDetails,
      });
    }

    return {
      courseProgress: {
        completedLessons,
        totalLessons,
        percent: totalLessons > 0 ? Math.floor((completedLessons / totalLessons) * 100) : 0,
      },
      sections: sectionDetails,
    };
  }

  private async checkCourseCompletion(lessonId: string, userId: string): Promise<void> {
    // lessonId → sectionId → courseId 조회
    const [lesson] = await this.db
      .select({ sectionId: courseLessons.sectionId })
      .from(courseLessons)
      .where(eq(courseLessons.id, lessonId))
      .limit(1);

    if (!lesson) return;

    const [section] = await this.db
      .select({ courseId: courseSections.courseId })
      .from(courseSections)
      .where(eq(courseSections.id, lesson.sectionId))
      .limit(1);

    if (!section) return;

    const courseId = section.courseId;

    // 총 레슨 수와 완료된 레슨 수를 각각 단일 쿼리로 조회 (N+1 제거)
    const [totalResult] = await this.db
      .select({ total: count() })
      .from(courseLessons)
      .innerJoin(courseSections, eq(courseLessons.sectionId, courseSections.id))
      .where(eq(courseSections.courseId, courseId));

    const totalLessons = totalResult?.total ?? 0;
    if (totalLessons === 0) return;

    const [completedResult] = await this.db
      .select({ completed: count() })
      .from(courseLessonProgress)
      .innerJoin(courseLessons, eq(courseLessonProgress.lessonId, courseLessons.id))
      .innerJoin(courseSections, eq(courseLessons.sectionId, courseSections.id))
      .where(
        and(
          eq(courseSections.courseId, courseId),
          eq(courseLessonProgress.userId, userId),
          eq(courseLessonProgress.isCompleted, true),
        ),
      );

    const completedLessons = completedResult?.completed ?? 0;

    if (completedLessons >= totalLessons) {
      const [enrollment] = await this.db
        .select()
        .from(courseEnrollments)
        .where(
          and(
            eq(courseEnrollments.courseId, courseId),
            eq(courseEnrollments.userId, userId),
          ),
        )
        .limit(1);

      if (enrollment && !enrollment.completedAt) {
        await this.db
          .update(courseEnrollments)
          .set({ completedAt: new Date() })
          .where(eq(courseEnrollments.id, enrollment.id));
      }
    }
  }
}
