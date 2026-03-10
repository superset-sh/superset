/**
 * Course Feature Schema
 * 온라인 강의 등록·수강·진행률 추적 관련 테이블
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { baseColumns } from "../../../utils";
import { files } from "../../core/files";
import { profiles } from "../../core/profiles";

// ============================================================================
// Enums
// ============================================================================

export const courseStatusEnum = pgEnum("course_status", ["draft", "published"]);

// ============================================================================
// Tables
// ============================================================================

/**
 * course_topics - 주제 관리
 */
export const courseTopics = pgTable("course_topics", {
  ...baseColumns(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

/**
 * course_courses - 강의 메인 테이블
 * TipTap JSON 기반 설명 콘텐츠, 이미지 슬라이더 Extension 포함
 */
export const courseCourses = pgTable(
  "course_courses",
  {
    ...baseColumns(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => courseTopics.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull().unique(),
    summary: text("summary"),
    content: jsonb("content"),
    thumbnailUrl: text("thumbnail_url"),
    status: courseStatusEnum("status").notNull().default("draft"),
    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    totalLessons: integer("total_lessons").notNull().default(0),
    estimatedMinutes: integer("estimated_minutes"),
    sortOrder: integer("sort_order").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_courses_topic").on(table.topicId),
    index("idx_courses_status").on(table.status),
  ],
);

/**
 * course_sections - 커리큘럼 섹션
 */
export const courseSections = pgTable(
  "course_sections",
  {
    ...baseColumns(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courseCourses.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("idx_sections_course").on(table.courseId)],
);

/**
 * course_lessons - 레슨 (동영상 단위)
 */
export const courseLessons = pgTable(
  "course_lessons",
  {
    ...baseColumns(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => courseSections.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    videoFileId: uuid("video_file_id").references(() => files.id, { onDelete: "set null" }),
    videoDurationSeconds: integer("video_duration_seconds"),
    sortOrder: integer("sort_order").notNull().default(0),
    isFree: boolean("is_free").notNull().default(false),
  },
  (table) => [index("idx_lessons_section").on(table.sectionId)],
);

/**
 * course_enrollments - 수강 신청
 * Unique: (courseId, userId)
 */
export const courseEnrollments = pgTable(
  "course_enrollments",
  {
    ...baseColumns(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courseCourses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("course_enrollments_unique").on(table.courseId, table.userId),
    index("idx_enrollments_user").on(table.userId),
    index("idx_enrollments_course").on(table.courseId),
  ],
);

/**
 * course_lesson_progress - 레슨별 진행률 추적
 * Unique: (lessonId, userId)
 */
export const courseLessonProgress = pgTable(
  "course_lesson_progress",
  {
    ...baseColumns(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => courseLessons.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    watchedSeconds: integer("watched_seconds").notNull().default(0),
    totalSeconds: integer("total_seconds").notNull().default(0),
    progressPercent: integer("progress_percent").notNull().default(0),
    lastPosition: integer("last_position").notNull().default(0),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("course_lesson_progress_unique").on(table.lessonId, table.userId),
    index("idx_progress_user").on(table.userId),
    index("idx_progress_lesson").on(table.lessonId),
  ],
);

/**
 * course_attachments - 강의 첨부파일 (PDF)
 */
export const courseAttachments = pgTable("course_attachments", {
  ...baseColumns(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courseCourses.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").references(() => files.id, { onDelete: "cascade" }),
  url: text("url"),
  fileType: varchar("file_type", { length: 50 }),
  title: varchar("title", { length: 200 }),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ============================================================================
// Type Exports
// ============================================================================

export type CourseTopic = typeof courseTopics.$inferSelect;
export type NewCourseTopic = typeof courseTopics.$inferInsert;

export type Course = typeof courseCourses.$inferSelect;
export type NewCourse = typeof courseCourses.$inferInsert;

export type CourseSection = typeof courseSections.$inferSelect;
export type NewCourseSection = typeof courseSections.$inferInsert;

export type CourseLesson = typeof courseLessons.$inferSelect;
export type NewCourseLesson = typeof courseLessons.$inferInsert;

export type CourseEnrollment = typeof courseEnrollments.$inferSelect;
export type NewCourseEnrollment = typeof courseEnrollments.$inferInsert;

export type CourseLessonProgress = typeof courseLessonProgress.$inferSelect;
export type NewCourseLessonProgress = typeof courseLessonProgress.$inferInsert;

export type CourseAttachment = typeof courseAttachments.$inferSelect;
export type NewCourseAttachment = typeof courseAttachments.$inferInsert;
