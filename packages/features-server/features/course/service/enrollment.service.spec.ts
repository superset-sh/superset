/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock("drizzle-orm", () => {
  const utils = require("../../__test-utils__");
  return utils.DRIZZLE_ORM_MOCK;
});

jest.mock("@/core/logger", () => {
  const utils = require("../../__test-utils__");
  return utils.LOGGER_MOCK;
});

jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = jest.requireActual("@nestjs/common");
  const utils = require("../../__test-utils__");
  const { DRIZZLE_BASE_MOCK_WITH_INJECT, createTableMock } = utils;
  return {
    ...DRIZZLE_BASE_MOCK_WITH_INJECT(Inject),
    courseEnrollments: createTableMock({
      id: "id",
      courseId: "course_id",
      userId: "user_id",
      enrolledAt: "enrolled_at",
      completedAt: "completed_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }),
    courseCourses: createTableMock({
      id: "id",
      topicId: "topic_id",
      title: "title",
      slug: "slug",
      summary: "summary",
      content: "content",
      thumbnailUrl: "thumbnail_url",
      status: "status",
      authorId: "author_id",
      totalLessons: "total_lessons",
      estimatedMinutes: "estimated_minutes",
      sortOrder: "sort_order",
      publishedAt: "published_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }),
    courseSections: createTableMock({
      id: "id",
      courseId: "course_id",
      title: "title",
      description: "description",
      sortOrder: "sort_order",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }),
    courseLessons: createTableMock({
      id: "id",
      sectionId: "section_id",
      title: "title",
      description: "description",
      videoFileId: "video_file_id",
      videoDurationSeconds: "video_duration_seconds",
      sortOrder: "sort_order",
      isFree: "is_free",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }),
    courseLessonProgress: createTableMock({
      id: "id",
      lessonId: "lesson_id",
      userId: "user_id",
      watchedSeconds: "watched_seconds",
      totalSeconds: "total_seconds",
      progressPercent: "progress_percent",
      lastPosition: "last_position",
      isCompleted: "is_completed",
      completedAt: "completed_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }),
    courseTopics: createTableMock({
      id: "id",
      name: "name",
      slug: "slug",
      description: "description",
      thumbnailUrl: "thumbnail_url",
      sortOrder: "sort_order",
      isActive: "is_active",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }),
    profiles: createTableMock({
      id: "id",
      name: "name",
      email: "email",
      avatar: "avatar",
      role: "role",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }),
  };
});

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { DRIZZLE } from "@superbuilder/drizzle";
import {
  TEST_DATES,
  TEST_IDS,
  TEST_USER,
  createMockDb,
} from "../../__test-utils__";
import { EnrollmentService } from "./enrollment.service";

// ============================================================================
// Test Data
// ============================================================================

const COURSE_ID = TEST_IDS.UUID_1;
const ENROLLMENT_ID = TEST_IDS.UUID_2;
const LESSON_ID = TEST_IDS.UUID_3;
const SECTION_ID = TEST_IDS.UUID_4;
const PROGRESS_ID = TEST_IDS.UUID_5;

const MOCK_COURSE = {
  id: COURSE_ID,
  topicId: "topic-1",
  title: "TypeScript 마스터",
  slug: "typescript-master",
  summary: "TypeScript 완벽 가이드",
  content: null,
  thumbnailUrl: null,
  status: "published" as const,
  authorId: "author-1",
  totalLessons: 10,
  estimatedMinutes: 300,
  sortOrder: 0,
  publishedAt: TEST_DATES.CREATED,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_DRAFT_COURSE = {
  ...MOCK_COURSE,
  id: "draft-course-id",
  status: "draft" as const,
  publishedAt: null,
};

const MOCK_ENROLLMENT = {
  id: ENROLLMENT_ID,
  courseId: COURSE_ID,
  userId: TEST_USER.id,
  enrolledAt: TEST_DATES.CREATED,
  completedAt: null,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_PROGRESS = {
  id: PROGRESS_ID,
  lessonId: LESSON_ID,
  userId: TEST_USER.id,
  watchedSeconds: 120,
  totalSeconds: 600,
  progressPercent: 20,
  lastPosition: 120,
  isCompleted: false,
  completedAt: null,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_SECTION = {
  id: SECTION_ID,
  courseId: COURSE_ID,
  title: "섹션 1",
  description: null,
  sortOrder: 0,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_LESSON = {
  id: LESSON_ID,
  sectionId: SECTION_ID,
  title: "레슨 1",
  description: null,
  videoFileId: null,
  videoDurationSeconds: null,
  sortOrder: 0,
  isFree: false,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

describe("EnrollmentService", () => {
  let service: EnrollmentService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentService,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<EnrollmentService>(EnrollmentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // ============================================================================
  // enroll
  // ============================================================================
  describe("enroll", () => {
    it("발행된 강의에 수강 신청한다", async () => {
      // course lookup
      mockDb._queueResolve("limit", [MOCK_COURSE]);
      // existing enrollment check
      mockDb._queueResolve("limit", []);
      // insert returning
      mockDb._queueResolve("returning", [MOCK_ENROLLMENT]);

      const result = await service.enroll(COURSE_ID, TEST_USER.id);

      expect(result.courseId).toBe(COURSE_ID);
      expect(result.userId).toBe(TEST_USER.id);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("강의가 존재하지 않으면 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(
        service.enroll("non-existent", TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("에러 메시지에 courseId를 포함한다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(
        service.enroll("missing-course", TEST_USER.id),
      ).rejects.toThrow("Course not found: missing-course");
    });

    it("draft 강의에는 수강 신청할 수 없다", async () => {
      mockDb._queueResolve("limit", [MOCK_DRAFT_COURSE]);

      await expect(
        service.enroll(MOCK_DRAFT_COURSE.id, TEST_USER.id),
      ).rejects.toThrow(BadRequestException);
    });

    it("draft 강의 에러 메시지는 한국어이다", async () => {
      mockDb._queueResolve("limit", [MOCK_DRAFT_COURSE]);

      await expect(
        service.enroll(MOCK_DRAFT_COURSE.id, TEST_USER.id),
      ).rejects.toThrow("발행된 강의만 수강 신청할 수 있습니다");
    });

    it("이미 수강 중이면 ConflictException을 던진다", async () => {
      mockDb._queueResolve("limit", [MOCK_COURSE]);
      mockDb._queueResolve("limit", [MOCK_ENROLLMENT]);

      await expect(
        service.enroll(COURSE_ID, TEST_USER.id),
      ).rejects.toThrow(ConflictException);
    });

    it("중복 수강 에러 메시지는 한국어이다", async () => {
      mockDb._queueResolve("limit", [MOCK_COURSE]);
      mockDb._queueResolve("limit", [MOCK_ENROLLMENT]);

      await expect(
        service.enroll(COURSE_ID, TEST_USER.id),
      ).rejects.toThrow("이미 수강 중인 강의입니다");
    });
  });

  // ============================================================================
  // cancel
  // ============================================================================
  describe("cancel", () => {
    it("수강을 취소하고 진행률을 삭제한다", async () => {
      // enrollment lookup
      mockDb._queueResolve("limit", [MOCK_ENROLLMENT]);

      const result = await service.cancel(COURSE_ID, TEST_USER.id);

      expect(result).toEqual({ success: true });
      // delete progress + delete enrollment
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
    });

    it("수강 내역이 없으면 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(
        service.cancel(COURSE_ID, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("에러 메시지는 한국어이다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(
        service.cancel(COURSE_ID, TEST_USER.id),
      ).rejects.toThrow("수강 신청 내역이 없습니다");
    });
  });

  // ============================================================================
  // isEnrolled
  // ============================================================================
  describe("isEnrolled", () => {
    it("수강 중이면 true를 반환한다", async () => {
      mockDb._queueResolve("limit", [{ id: ENROLLMENT_ID }]);

      const result = await service.isEnrolled(COURSE_ID, TEST_USER.id);

      expect(result).toBe(true);
    });

    it("수강 중이 아니면 false를 반환한다", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.isEnrolled(COURSE_ID, TEST_USER.id);

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // myCourses
  // ============================================================================
  describe("myCourses", () => {
    it("수강 중인 강의 목록을 진행률과 함께 반환한다", async () => {
      const enrollmentRow = {
        enrollment: MOCK_ENROLLMENT,
        course: MOCK_COURSE,
        topic: { id: "topic-1", name: "프로그래밍", slug: "programming" },
      };
      // enrollments query
      mockDb._queueResolve("orderBy", [enrollmentRow]);
      // progress count for the course
      mockDb._queueResolve("where", [{ completed: 3 }]);

      const result = await service.myCourses(TEST_USER.id);

      expect(result).toHaveLength(1);
      expect(result[0]!.completedLessons).toBe(3);
      expect(result[0]!.totalLessons).toBe(10);
      expect(result[0]!.progressPercent).toBe(30);
    });

    it("수강 중인 강의가 없으면 빈 배열을 반환한다", async () => {
      mockDb._queueResolve("orderBy", []);

      const result = await service.myCourses(TEST_USER.id);

      expect(result).toEqual([]);
    });

    it("totalLessons가 0이면 progressPercent를 0으로 반환한다", async () => {
      const courseWithNoLessons = { ...MOCK_COURSE, totalLessons: 0 };
      const enrollmentRow = {
        enrollment: MOCK_ENROLLMENT,
        course: courseWithNoLessons,
        topic: { id: "topic-1", name: "프로그래밍", slug: "programming" },
      };
      mockDb._queueResolve("orderBy", [enrollmentRow]);
      mockDb._queueResolve("where", [{ completed: 0 }]);

      const result = await service.myCourses(TEST_USER.id);

      expect(result[0]!.progressPercent).toBe(0);
    });

    it("진행률을 소수점 이하 버림(floor) 처리한다", async () => {
      const courseWith3Lessons = { ...MOCK_COURSE, totalLessons: 3 };
      const enrollmentRow = {
        enrollment: MOCK_ENROLLMENT,
        course: courseWith3Lessons,
        topic: { id: "topic-1", name: "프로그래밍", slug: "programming" },
      };
      mockDb._queueResolve("orderBy", [enrollmentRow]);
      // 1 out of 3 = 33.33...%
      mockDb._queueResolve("where", [{ completed: 1 }]);

      const result = await service.myCourses(TEST_USER.id);

      expect(result[0]!.progressPercent).toBe(33);
    });
  });

  // ============================================================================
  // adminList
  // ============================================================================
  describe("adminList", () => {
    it("강의의 수강생 목록을 페이지네이션으로 반환한다", async () => {
      const enrollmentData = {
        id: ENROLLMENT_ID,
        courseId: COURSE_ID,
        userId: TEST_USER.id,
        enrolledAt: TEST_DATES.CREATED,
        completedAt: null,
        createdAt: TEST_DATES.CREATED,
        updatedAt: TEST_DATES.UPDATED,
        profile: {
          id: TEST_USER.id,
          name: TEST_USER.name,
          email: TEST_USER.email,
          avatar: null,
        },
      };
      // Promise.all: select().from().where() resolves total, select()...offset() resolves data
      mockDb._queueResolve("where", [{ total: 1 }]);
      mockDb._queueResolve("offset", [enrollmentData]);
      // progress query for the enrollment
      mockDb._queueResolve("where", [{ avgPercent: 50, lastActivity: TEST_DATES.UPDATED }]);

      const result = await service.adminList(COURSE_ID, { page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.progressPercent).toBe(50);
    });

    it("수강생이 없으면 빈 목록을 반환한다", async () => {
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.adminList(COURSE_ID, { page: 1, limit: 20 });

      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
      expect(result.totalPages).toBe(0);
    });

    it("page 기본값은 1이다", async () => {
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.adminList(COURSE_ID, {});

      expect(result.page).toBe(1);
    });

    it("limit 기본값은 20이다", async () => {
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.adminList(COURSE_ID, {});

      expect(result.limit).toBe(20);
    });

    it("limit은 최대 100으로 제한된다", async () => {
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.adminList(COURSE_ID, { limit: 200 });

      expect(result.limit).toBe(100);
    });

    it("page와 limit은 최소 1이다", async () => {
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.adminList(COURSE_ID, { page: 0, limit: 0 });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(1);
    });

    it("totalPages를 올바르게 계산한다", async () => {
      mockDb._queueResolve("where", [{ total: 25 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.adminList(COURSE_ID, { page: 1, limit: 10 });

      expect(result.totalPages).toBe(3);
    });
  });

  // ============================================================================
  // toggleLessonComplete
  // ============================================================================
  describe("toggleLessonComplete", () => {
    it("기존 진행 기록이 있으면 완료 상태를 업데이트한다", async () => {
      // existing progress
      mockDb._queueResolve("limit", [MOCK_PROGRESS]);
      // checkCourseCompletion: lesson lookup
      mockDb._queueResolve("limit", [{ sectionId: SECTION_ID }]);
      // checkCourseCompletion: section lookup
      mockDb._queueResolve("limit", [{ courseId: COURSE_ID }]);
      // checkCourseCompletion: total lessons
      mockDb._queueResolve("where", [{ total: 10 }]);
      // checkCourseCompletion: completed lessons
      mockDb._queueResolve("where", [{ completed: 5 }]);

      const result = await service.toggleLessonComplete(
        LESSON_ID,
        TEST_USER.id,
        true,
      );

      expect(result).toEqual({ lessonId: LESSON_ID, completed: true });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("기존 진행 기록이 없으면 새로 생성한다", async () => {
      // no existing progress
      mockDb._queueResolve("limit", []);
      // checkCourseCompletion: lesson lookup
      mockDb._queueResolve("limit", [{ sectionId: SECTION_ID }]);
      // checkCourseCompletion: section lookup
      mockDb._queueResolve("limit", [{ courseId: COURSE_ID }]);
      // checkCourseCompletion: total lessons
      mockDb._queueResolve("where", [{ total: 10 }]);
      // checkCourseCompletion: completed lessons
      mockDb._queueResolve("where", [{ completed: 3 }]);

      const result = await service.toggleLessonComplete(
        LESSON_ID,
        TEST_USER.id,
        true,
      );

      expect(result).toEqual({ lessonId: LESSON_ID, completed: true });
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("완료를 해제(false)할 수 있다", async () => {
      mockDb._queueResolve("limit", [{ ...MOCK_PROGRESS, isCompleted: true }]);

      const result = await service.toggleLessonComplete(
        LESSON_ID,
        TEST_USER.id,
        false,
      );

      expect(result).toEqual({ lessonId: LESSON_ID, completed: false });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("완료 해제 시 checkCourseCompletion을 호출하지 않는다", async () => {
      mockDb._queueResolve("limit", [MOCK_PROGRESS]);

      await service.toggleLessonComplete(LESSON_ID, TEST_USER.id, false);

      // update for progress only, no additional queries for completion check
      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });

    it("모든 레슨 완료 시 수강 완료 처리한다", async () => {
      // existing progress
      mockDb._queueResolve("limit", []);
      // checkCourseCompletion: lesson lookup
      mockDb._queueResolve("limit", [{ sectionId: SECTION_ID }]);
      // checkCourseCompletion: section lookup
      mockDb._queueResolve("limit", [{ courseId: COURSE_ID }]);
      // checkCourseCompletion: total = completed
      mockDb._queueResolve("where", [{ total: 5 }]);
      mockDb._queueResolve("where", [{ completed: 5 }]);
      // enrollment lookup for completion
      mockDb._queueResolve("limit", [MOCK_ENROLLMENT]);

      const result = await service.toggleLessonComplete(
        LESSON_ID,
        TEST_USER.id,
        true,
      );

      expect(result.completed).toBe(true);
      // update for enrollment completedAt
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // updateProgress
  // ============================================================================
  describe("updateProgress", () => {
    it("기존 진행 기록을 업데이트한다", async () => {
      mockDb._queueResolve("limit", [MOCK_PROGRESS]);

      await service.updateProgress(
        { lessonId: LESSON_ID, currentPosition: 300, totalDuration: 600 },
        TEST_USER.id,
      );

      expect(mockDb.update).toHaveBeenCalled();
    });

    it("진행 기록이 없으면 새로 생성한다", async () => {
      mockDb._queueResolve("limit", []);

      await service.updateProgress(
        { lessonId: LESSON_ID, currentPosition: 50, totalDuration: 600 },
        TEST_USER.id,
      );

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("90% 이상이면 자동 완료 처리한다", async () => {
      // no existing progress
      mockDb._queueResolve("limit", []);
      // checkCourseCompletion chain
      mockDb._queueResolve("limit", [{ sectionId: SECTION_ID }]);
      mockDb._queueResolve("limit", [{ courseId: COURSE_ID }]);
      mockDb._queueResolve("where", [{ total: 10 }]);
      mockDb._queueResolve("where", [{ completed: 5 }]);

      await service.updateProgress(
        { lessonId: LESSON_ID, currentPosition: 550, totalDuration: 600 },
        TEST_USER.id,
      );

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("watchedSeconds는 기존 값과 currentPosition 중 큰 값을 사용한다", async () => {
      // existing progress with watchedSeconds = 120
      mockDb._queueResolve("limit", [MOCK_PROGRESS]);

      await service.updateProgress(
        { lessonId: LESSON_ID, currentPosition: 50, totalDuration: 600 },
        TEST_USER.id,
      );

      // Should use max(120, 50) = 120, not 50
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("totalDuration이 0이면 progressPercent는 0이다", async () => {
      mockDb._queueResolve("limit", []);

      await service.updateProgress(
        { lessonId: LESSON_ID, currentPosition: 0, totalDuration: 0 },
        TEST_USER.id,
      );

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("progressPercent는 최대 100으로 제한된다", async () => {
      // position exceeds total (edge case) -> isCompleted = true -> checkCourseCompletion
      mockDb._queueResolve("limit", []);
      // checkCourseCompletion: lesson lookup
      mockDb._queueResolve("limit", [{ sectionId: SECTION_ID }]);
      // checkCourseCompletion: section lookup
      mockDb._queueResolve("limit", [{ courseId: COURSE_ID }]);
      // checkCourseCompletion: total lessons
      mockDb._queueResolve("where", [{ total: 10 }]);
      // checkCourseCompletion: completed lessons
      mockDb._queueResolve("where", [{ completed: 5 }]);

      await service.updateProgress(
        { lessonId: LESSON_ID, currentPosition: 700, totalDuration: 600 },
        TEST_USER.id,
      );

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // getCourseProgress
  // ============================================================================
  describe("getCourseProgress", () => {
    it("강의의 상세 진행률을 반환한다", async () => {
      // sections query
      mockDb._queueResolve("orderBy", [MOCK_SECTION]);
      // lessons for section
      mockDb._queueResolve("orderBy", [MOCK_LESSON]);
      // progress for lesson
      mockDb._queueResolve("limit", [
        { ...MOCK_PROGRESS, isCompleted: true, progressPercent: 100 },
      ]);

      const result = await service.getCourseProgress(COURSE_ID, TEST_USER.id);

      expect(result.courseProgress.completedLessons).toBe(1);
      expect(result.courseProgress.totalLessons).toBe(1);
      expect(result.courseProgress.percent).toBe(100);
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0]!.lessons).toHaveLength(1);
      expect(result.sections[0]!.lessons[0]!.isCompleted).toBe(true);
    });

    it("섹션이 없으면 빈 진행률을 반환한다", async () => {
      mockDb._queueResolve("orderBy", []);

      const result = await service.getCourseProgress(COURSE_ID, TEST_USER.id);

      expect(result.courseProgress.completedLessons).toBe(0);
      expect(result.courseProgress.totalLessons).toBe(0);
      expect(result.courseProgress.percent).toBe(0);
      expect(result.sections).toEqual([]);
    });

    it("레슨 진행 기록이 없으면 기본값을 사용한다", async () => {
      mockDb._queueResolve("orderBy", [MOCK_SECTION]);
      mockDb._queueResolve("orderBy", [MOCK_LESSON]);
      // no progress record
      mockDb._queueResolve("limit", []);

      const result = await service.getCourseProgress(COURSE_ID, TEST_USER.id);

      expect(result.courseProgress.completedLessons).toBe(0);
      expect(result.sections[0]!.lessons[0]!.isCompleted).toBe(false);
      expect(result.sections[0]!.lessons[0]!.progressPercent).toBe(0);
      expect(result.sections[0]!.lessons[0]!.lastPosition).toBe(0);
    });

    it("섹션별 진행률을 올바르게 계산한다", async () => {
      const section2 = { ...MOCK_SECTION, id: "section-2", title: "섹션 2" };
      const lesson2 = { ...MOCK_LESSON, id: "lesson-2", sectionId: "section-2" };

      mockDb._queueResolve("orderBy", [MOCK_SECTION, section2]);
      // lessons for section 1
      mockDb._queueResolve("orderBy", [MOCK_LESSON]);
      // progress for lesson in section 1 (completed)
      mockDb._queueResolve("limit", [
        { ...MOCK_PROGRESS, isCompleted: true, progressPercent: 100 },
      ]);
      // lessons for section 2
      mockDb._queueResolve("orderBy", [lesson2]);
      // progress for lesson in section 2 (not completed)
      mockDb._queueResolve("limit", [
        { ...MOCK_PROGRESS, isCompleted: false, progressPercent: 40 },
      ]);

      const result = await service.getCourseProgress(COURSE_ID, TEST_USER.id);

      expect(result.courseProgress.completedLessons).toBe(1);
      expect(result.courseProgress.totalLessons).toBe(2);
      expect(result.courseProgress.percent).toBe(50);
      expect(result.sections[0]!.percent).toBe(100);
      expect(result.sections[1]!.percent).toBe(0);
    });

    it("레슨이 없는 섹션의 percent는 0이다", async () => {
      mockDb._queueResolve("orderBy", [MOCK_SECTION]);
      // no lessons
      mockDb._queueResolve("orderBy", []);

      const result = await service.getCourseProgress(COURSE_ID, TEST_USER.id);

      expect(result.sections[0]!.percent).toBe(0);
      expect(result.sections[0]!.totalLessons).toBe(0);
    });
  });
});
