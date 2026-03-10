import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { DRIZZLE } from "@superbuilder/drizzle";
import { TEST_DATES, TEST_IDS, TEST_USER, createMockDb } from "../../__test-utils__";
import { CourseService } from "./course.service";

jest.mock("drizzle-orm", () => {
  const sqlResult = { type: "sql", as: jest.fn().mockReturnThis() };
  const sqlFn: any = jest.fn((..._args: any[]) => sqlResult);
  sqlFn.join = jest.fn();
  return {
    eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
    and: jest.fn((...conds: any[]) => conds),
    desc: jest.fn((field: any) => ({ field, type: "desc" })),
    asc: jest.fn((field: any) => ({ field, type: "asc" })),
    count: jest.fn(() => ({ type: "count" })),
    sql: sqlFn,
    ilike: jest.fn((field: any, value: any) => ({ field, value, type: "ilike" })),
  };
});

jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = require("@nestjs/common");
  return {
    DRIZZLE: "DRIZZLE_TOKEN",
    InjectDrizzle: () => Inject("DRIZZLE_TOKEN"),
    courseCourses: {
      id: { name: "id" },
      topicId: { name: "topic_id" },
      title: { name: "title" },
      slug: { name: "slug" },
      summary: { name: "summary" },
      content: { name: "content" },
      thumbnailUrl: { name: "thumbnail_url" },
      status: { name: "status" },
      authorId: { name: "author_id" },
      totalLessons: { name: "total_lessons" },
      estimatedMinutes: { name: "estimated_minutes" },
      sortOrder: { name: "sort_order" },
      publishedAt: { name: "published_at" },
      createdAt: { name: "created_at" },
      updatedAt: { name: "updated_at" },
    },
    courseTopics: {
      id: { name: "id" },
      name: { name: "name" },
      slug: { name: "slug" },
    },
    courseSections: {
      id: { name: "id" },
      courseId: { name: "course_id" },
      title: { name: "title" },
      description: { name: "description" },
      sortOrder: { name: "sort_order" },
    },
    courseLessons: {
      id: { name: "id" },
      sectionId: { name: "section_id" },
      title: { name: "title" },
      sortOrder: { name: "sort_order" },
    },
    courseEnrollments: {
      courseId: { name: "course_id" },
      userId: { name: "user_id" },
    },
  };
});

jest.mock("@/core/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// ============================================================================
// Test Data
// ============================================================================

const MOCK_TOPIC = {
  id: TEST_IDS.UUID_2,
  name: "Frontend",
  slug: "frontend",
};

const MOCK_COURSE = {
  id: TEST_IDS.UUID_1,
  topicId: TEST_IDS.UUID_2,
  title: "React Fundamentals",
  slug: "react-fundamentals-abc123",
  summary: "Learn React from scratch",
  content: { type: "doc", content: [] },
  thumbnailUrl: "https://example.com/thumb.jpg",
  status: "draft" as const,
  authorId: TEST_USER.id,
  totalLessons: 5,
  estimatedMinutes: 120,
  sortOrder: 0,
  publishedAt: null,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_PUBLISHED_COURSE = {
  ...MOCK_COURSE,
  status: "published" as const,
  publishedAt: TEST_DATES.NOW,
};

const MOCK_COURSE_WITH_TOPIC = {
  ...MOCK_COURSE,
  topic: MOCK_TOPIC,
  enrollmentCount: 10,
};

const MOCK_PUBLISHED_COURSE_WITH_TOPIC = {
  ...MOCK_PUBLISHED_COURSE,
  topic: MOCK_TOPIC,
  enrollmentCount: 10,
};

const MOCK_SECTION = {
  id: TEST_IDS.UUID_3,
  courseId: TEST_IDS.UUID_1,
  title: "Getting Started",
  description: "Introduction section",
  sortOrder: 0,
};

const MOCK_SECTION_2 = {
  id: TEST_IDS.UUID_4,
  courseId: TEST_IDS.UUID_1,
  title: "Advanced Topics",
  description: "Deep dive section",
  sortOrder: 1,
};

// ============================================================================
// Tests
// ============================================================================

describe("CourseService", () => {
  let service: CourseService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CourseService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<CourseService>(CourseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // ============================================================================
  // findPublished
  // ============================================================================
  describe("findPublished", () => {
    it("published 강의 목록을 페이지네이션과 함께 반환한다", async () => {
      // select({ total: count() }).from().where()
      mockDb._queueResolve("where", [{ total: 1 }]);
      // select(...).from().innerJoin().where().orderBy().limit().offset()
      mockDb._queueResolve("offset", [MOCK_PUBLISHED_COURSE_WITH_TOPIC]);

      const result = await service.findPublished({ page: 1, limit: 10 });

      expect(result.items).toEqual([MOCK_PUBLISHED_COURSE_WITH_TOPIC]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it("topicId 필터를 적용한다", async () => {
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.findPublished({
        page: 1,
        limit: 10,
        topicId: TEST_IDS.UUID_2,
      });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("sort=latest 일 때 publishedAt desc 정렬을 사용한다", async () => {
      mockDb._queueResolve("where", [{ total: 1 }]);
      mockDb._queueResolve("offset", [MOCK_PUBLISHED_COURSE_WITH_TOPIC]);

      const result = await service.findPublished({
        page: 1,
        limit: 10,
        sort: "latest",
      });

      expect(result.items).toHaveLength(1);
      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it("기본 sort는 sortOrder asc를 사용한다", async () => {
      mockDb._queueResolve("where", [{ total: 2 }]);
      mockDb._queueResolve("offset", [
        MOCK_PUBLISHED_COURSE_WITH_TOPIC,
        { ...MOCK_PUBLISHED_COURSE_WITH_TOPIC, id: TEST_IDS.UUID_5, sortOrder: 1 },
      ]);

      const result = await service.findPublished({ page: 1, limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("빈 목록을 반환한다", async () => {
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.findPublished({ page: 1, limit: 10 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it("page/limit 기본값을 적용한다 (page=1, limit=20)", async () => {
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.findPublished({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it("limit을 최대 100으로 제한한다", async () => {
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.findPublished({ page: 1, limit: 500 });

      expect(result.limit).toBe(100);
    });

    it("limit을 최소 1로 제한한다", async () => {
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.findPublished({ page: 1, limit: 0 });

      expect(result.limit).toBe(1);
    });

    it("page를 최소 1로 제한한다", async () => {
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.findPublished({ page: -5, limit: 10 });

      expect(result.page).toBe(1);
    });

    it("totalPages를 올바르게 계산한다", async () => {
      mockDb._queueResolve("where", [{ total: 25 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.findPublished({ page: 1, limit: 10 });

      expect(result.totalPages).toBe(3);
    });
  });

  // ============================================================================
  // findBySlug
  // ============================================================================
  describe("findBySlug", () => {
    it("slug로 published 강의를 반환한다", async () => {
      mockDb._queueResolve("limit", [MOCK_PUBLISHED_COURSE_WITH_TOPIC]);

      const result = await service.findBySlug("react-fundamentals-abc123");

      expect(result).toEqual(MOCK_PUBLISHED_COURSE_WITH_TOPIC);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.innerJoin).toHaveBeenCalled();
    });

    it("존재하지 않는 slug는 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.findBySlug("non-existent-slug")).rejects.toThrow(NotFoundException);
    });

    it("에러 메시지에 slug를 포함한다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.findBySlug("my-slug")).rejects.toThrow("Course not found: my-slug");
    });
  });

  // ============================================================================
  // findById
  // ============================================================================
  describe("findById", () => {
    it("ID로 강의를 반환한다 (topic join 포함)", async () => {
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);

      const result = await service.findById(TEST_IDS.UUID_1);

      expect(result).toEqual(MOCK_COURSE_WITH_TOPIC);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.innerJoin).toHaveBeenCalled();
    });

    it("존재하지 않는 ID는 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.findById("non-existent-id")).rejects.toThrow(NotFoundException);
    });

    it("에러 메시지에 ID를 포함한다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.findById(TEST_IDS.UUID_1)).rejects.toThrow(
        `Course not found: ${TEST_IDS.UUID_1}`,
      );
    });
  });

  // ============================================================================
  // adminList
  // ============================================================================
  describe("adminList", () => {
    it("모든 강의를 페이지네이션과 함께 반환한다 (draft 포함)", async () => {
      mockDb._queueResolve("where", [{ total: 2 }]);
      mockDb._queueResolve("offset", [MOCK_COURSE_WITH_TOPIC, MOCK_PUBLISHED_COURSE_WITH_TOPIC]);

      const result = await service.adminList({ page: 1, limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it("status 필터를 적용한다", async () => {
      mockDb._queueResolve("where", [{ total: 1 }]);
      mockDb._queueResolve("offset", [MOCK_COURSE_WITH_TOPIC]);

      const result = await service.adminList({
        page: 1,
        limit: 10,
        status: "draft",
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("topicId 필터를 적용한다", async () => {
      mockDb._queueResolve("where", [{ total: 1 }]);
      mockDb._queueResolve("offset", [MOCK_COURSE_WITH_TOPIC]);

      const result = await service.adminList({
        page: 1,
        limit: 10,
        topicId: TEST_IDS.UUID_2,
      });

      expect(result.items).toHaveLength(1);
    });

    it("search 필터 (ilike)를 적용한다", async () => {
      mockDb._queueResolve("where", [{ total: 1 }]);
      mockDb._queueResolve("offset", [MOCK_COURSE_WITH_TOPIC]);

      const result = await service.adminList({
        page: 1,
        limit: 10,
        search: "React",
      });

      expect(result.items).toHaveLength(1);
    });

    it("필터 없이 호출하면 모든 강의를 반환한다", async () => {
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.adminList({ page: 1, limit: 10 });

      expect(result.items).toEqual([]);
    });

    it("빈 목록을 반환한다", async () => {
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.adminList({ page: 1, limit: 20 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it("page/limit 기본값을 적용한다", async () => {
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.adminList({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it("limit을 최대 100으로 제한한다", async () => {
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("offset", []);

      const result = await service.adminList({ page: 1, limit: 200 });

      expect(result.limit).toBe(100);
    });
  });

  // ============================================================================
  // create
  // ============================================================================
  describe("create", () => {
    const CREATE_INPUT = {
      topicId: TEST_IDS.UUID_2,
      title: "New Course",
      summary: "A new course",
      content: { type: "doc", content: [] },
      thumbnailUrl: "https://example.com/new.jpg",
      estimatedMinutes: 60,
    };

    it("강의를 생성하고 slug를 자동 생성한다", async () => {
      // select({ max: ... }).from().where() → maxOrder
      mockDb._queueResolve("where", [{ max: 2 }]);
      // insert().values().returning()
      const createdCourse = {
        ...MOCK_COURSE,
        ...CREATE_INPUT,
        slug: "new-course-abc123",
        sortOrder: 3,
      };
      mockDb._queueResolve("returning", [createdCourse]);

      const result = await service.create(CREATE_INPUT, TEST_USER.id);

      expect(result).toEqual(createdCourse);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalled();
    });

    it("sortOrder를 기존 최대값 + 1로 설정한다", async () => {
      mockDb._queueResolve("where", [{ max: 5 }]);
      mockDb._queueResolve("returning", [{ ...MOCK_COURSE, sortOrder: 6 }]);

      const result = await service.create(CREATE_INPUT, TEST_USER.id);

      expect(result.sortOrder).toBe(6);
      expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 6 }));
    });

    it("기존 강의가 없을 때 sortOrder를 0으로 설정한다", async () => {
      mockDb._queueResolve("where", [{ max: -1 }]);
      mockDb._queueResolve("returning", [{ ...MOCK_COURSE, sortOrder: 0 }]);

      const result = await service.create(CREATE_INPUT, TEST_USER.id);

      expect(result.sortOrder).toBe(0);
      expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 0 }));
    });

    it("maxOrder가 null일 때 sortOrder를 0으로 설정한다", async () => {
      mockDb._queueResolve("where", [{ max: null }]);
      mockDb._queueResolve("returning", [{ ...MOCK_COURSE, sortOrder: 0 }]);

      await service.create(CREATE_INPUT, TEST_USER.id);

      expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 0 }));
    });

    it("authorId를 포함하여 저장한다", async () => {
      mockDb._queueResolve("where", [{ max: 0 }]);
      mockDb._queueResolve("returning", [MOCK_COURSE]);

      await service.create(CREATE_INPUT, TEST_USER.id);

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ authorId: TEST_USER.id }),
      );
    });

    it("선택적 필드 없이 최소 입력으로 생성한다", async () => {
      const minimalInput = {
        topicId: TEST_IDS.UUID_2,
        title: "Minimal Course",
      };
      mockDb._queueResolve("where", [{ max: -1 }]);
      mockDb._queueResolve("returning", [
        {
          ...MOCK_COURSE,
          title: "Minimal Course",
          summary: undefined,
          content: undefined,
          thumbnailUrl: undefined,
          estimatedMinutes: undefined,
        },
      ]);

      const result = await service.create(minimalInput, TEST_USER.id);

      expect(result).toBeDefined();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          topicId: TEST_IDS.UUID_2,
          title: "Minimal Course",
        }),
      );
    });
  });

  // ============================================================================
  // update
  // ============================================================================
  describe("update", () => {
    it("강의 필드를 업데이트한다", async () => {
      // findById: select().from().innerJoin().where().limit()
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      // update().set().where().returning()
      const updatedCourse = { ...MOCK_COURSE, summary: "Updated summary" };
      mockDb._queueResolve("returning", [updatedCourse]);

      const result = await service.update(TEST_IDS.UUID_1, {
        summary: "Updated summary",
      });

      expect(result.summary).toBe("Updated summary");
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });

    it("title 변경 시 slug를 자동으로 재생성한다", async () => {
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      const updatedCourse = {
        ...MOCK_COURSE,
        title: "Updated Title",
        slug: "updated-title-xyz789",
      };
      mockDb._queueResolve("returning", [updatedCourse]);

      const result = await service.update(TEST_IDS.UUID_1, {
        title: "Updated Title",
      });

      expect(result.title).toBe("Updated Title");
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Updated Title",
          slug: expect.stringContaining("updated-title"),
        }),
      );
    });

    it("title이 동일하면 slug를 재생성하지 않는다", async () => {
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      mockDb._queueResolve("returning", [MOCK_COURSE]);

      await service.update(TEST_IDS.UUID_1, {
        title: MOCK_COURSE.title, // same title
      });

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          title: MOCK_COURSE.title,
        }),
      );
      // slug should not be in the update data because title didn't change
      const setCall = (mockDb.set as jest.Mock).mock.calls[0][0];
      expect(setCall.slug).toBeUndefined();
    });

    it("명시적 slug가 제공되면 자동 생성 대신 사용한다", async () => {
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      const updatedCourse = {
        ...MOCK_COURSE,
        title: "New Title",
        slug: "custom-slug",
      };
      mockDb._queueResolve("returning", [updatedCourse]);

      await service.update(TEST_IDS.UUID_1, {
        title: "New Title",
        slug: "custom-slug",
      });

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: "custom-slug",
        }),
      );
    });

    it("topicId를 업데이트한다", async () => {
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      mockDb._queueResolve("returning", [{ ...MOCK_COURSE, topicId: TEST_IDS.UUID_5 }]);

      const result = await service.update(TEST_IDS.UUID_1, {
        topicId: TEST_IDS.UUID_5,
      });

      expect(result.topicId).toBe(TEST_IDS.UUID_5);
    });

    it("thumbnailUrl을 업데이트한다", async () => {
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      mockDb._queueResolve("returning", [
        { ...MOCK_COURSE, thumbnailUrl: "https://new-thumb.jpg" },
      ]);

      await service.update(TEST_IDS.UUID_1, {
        thumbnailUrl: "https://new-thumb.jpg",
      });

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ thumbnailUrl: "https://new-thumb.jpg" }),
      );
    });

    it("estimatedMinutes를 업데이트한다", async () => {
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      mockDb._queueResolve("returning", [{ ...MOCK_COURSE, estimatedMinutes: 90 }]);

      const result = await service.update(TEST_IDS.UUID_1, {
        estimatedMinutes: 90,
      });

      expect(result.estimatedMinutes).toBe(90);
    });

    it("sortOrder를 업데이트한다", async () => {
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      mockDb._queueResolve("returning", [{ ...MOCK_COURSE, sortOrder: 5 }]);

      const result = await service.update(TEST_IDS.UUID_1, { sortOrder: 5 });

      expect(result.sortOrder).toBe(5);
    });

    it("content를 업데이트한다", async () => {
      const newContent = { type: "doc", content: [{ type: "paragraph" }] };
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      mockDb._queueResolve("returning", [{ ...MOCK_COURSE, content: newContent }]);

      await service.update(TEST_IDS.UUID_1, { content: newContent });

      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ content: newContent }));
    });

    it("존재하지 않는 강의는 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.update("non-existent", { title: "Test" })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================================================
  // delete
  // ============================================================================
  describe("delete", () => {
    it("강의를 삭제하고 success를 반환한다", async () => {
      // findById: select().from().innerJoin().where().limit()
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);

      const result = await service.delete(TEST_IDS.UUID_1);

      expect(result).toEqual({ success: true });
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("존재하지 않는 강의는 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.delete("non-existent")).rejects.toThrow(NotFoundException);
    });

    it("삭제 전 findById로 존재 여부를 확인한다", async () => {
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);

      await service.delete(TEST_IDS.UUID_1);

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // publish
  // ============================================================================
  describe("publish", () => {
    it("섹션과 레슨이 있으면 강의를 발행한다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      // select sections
      mockDb._queueResolve("where", [MOCK_SECTION]);
      // select lesson count for section
      mockDb._queueResolve("where", [{ total: 3 }]);
      // update().set().where().returning()
      mockDb._queueResolve("returning", [MOCK_PUBLISHED_COURSE]);

      const result = await service.publish(TEST_IDS.UUID_1);

      expect(result.status).toBe("published");
      expect(result.publishedAt).toBeDefined();
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ status: "published" }));
    });

    it("섹션이 없으면 BadRequestException을 던진다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      // select sections - empty
      mockDb._queueResolve("where", []);

      await expect(service.publish(TEST_IDS.UUID_1)).rejects.toThrow(BadRequestException);
    });

    it("섹션 없는 경우 에러 메시지를 포함한다", async () => {
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      mockDb._queueResolve("where", []);

      await expect(service.publish(TEST_IDS.UUID_1)).rejects.toThrow("최소 1개 섹션이 필요합니다");
    });

    it("레슨이 없으면 BadRequestException을 던진다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      // select sections - has one section
      mockDb._queueResolve("where", [MOCK_SECTION]);
      // select lesson count - zero
      mockDb._queueResolve("where", [{ total: 0 }]);

      await expect(service.publish(TEST_IDS.UUID_1)).rejects.toThrow(BadRequestException);
    });

    it("레슨 없는 경우 에러 메시지를 포함한다", async () => {
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      mockDb._queueResolve("where", [MOCK_SECTION]);
      mockDb._queueResolve("where", [{ total: 0 }]);

      await expect(service.publish(TEST_IDS.UUID_1)).rejects.toThrow("최소 1개 레슨이 필요합니다");
    });

    it("존재하지 않는 강의는 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.publish("non-existent")).rejects.toThrow(NotFoundException);
    });

    it("여러 섹션 중 하나라도 레슨이 있으면 발행한다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      // select sections - two sections
      mockDb._queueResolve("where", [MOCK_SECTION, MOCK_SECTION_2]);
      // first section lesson count = 0
      mockDb._queueResolve("where", [{ total: 0 }]);
      // second section lesson count = 2
      mockDb._queueResolve("where", [{ total: 2 }]);
      // update().set().where().returning()
      mockDb._queueResolve("returning", [MOCK_PUBLISHED_COURSE]);

      const result = await service.publish(TEST_IDS.UUID_1);

      expect(result.status).toBe("published");
    });

    it("여러 섹션 모두 레슨이 없으면 BadRequestException을 던진다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_COURSE_WITH_TOPIC]);
      // select sections - two sections
      mockDb._queueResolve("where", [MOCK_SECTION, MOCK_SECTION_2]);
      // both sections have 0 lessons
      mockDb._queueResolve("where", [{ total: 0 }]);
      mockDb._queueResolve("where", [{ total: 0 }]);

      await expect(service.publish(TEST_IDS.UUID_1)).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================================================
  // unpublish
  // ============================================================================
  describe("unpublish", () => {
    it("강의를 비발행(draft) 상태로 변경한다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_PUBLISHED_COURSE_WITH_TOPIC]);
      // update().set().where().returning()
      mockDb._queueResolve("returning", [MOCK_COURSE]);

      const result = await service.unpublish(TEST_IDS.UUID_1);

      expect(result.status).toBe("draft");
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ status: "draft" }));
    });

    it("존재하지 않는 강의는 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.unpublish("non-existent")).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // updateTotalLessons
  // ============================================================================
  describe("updateTotalLessons", () => {
    it("섹션의 레슨 수를 합산하여 totalLessons를 업데이트한다", async () => {
      // select sections
      mockDb._queueResolve("where", [MOCK_SECTION, MOCK_SECTION_2]);
      // select lesson count (IN query)
      mockDb._queueResolve("where", [{ total: 7 }]);

      await service.updateTotalLessons(TEST_IDS.UUID_1);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ totalLessons: 7 }));
    });

    it("섹션이 없으면 totalLessons를 0으로 설정한다", async () => {
      // select sections - empty
      mockDb._queueResolve("where", []);

      await service.updateTotalLessons(TEST_IDS.UUID_1);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ totalLessons: 0 }));
    });

    it("레슨이 없으면 totalLessons를 0으로 설정한다", async () => {
      // select sections
      mockDb._queueResolve("where", [MOCK_SECTION]);
      // select lesson count = 0
      mockDb._queueResolve("where", [{ total: 0 }]);

      await service.updateTotalLessons(TEST_IDS.UUID_1);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ totalLessons: 0 }));
    });

    it("lessonCount가 null일 때 totalLessons를 0으로 설정한다", async () => {
      // select sections
      mockDb._queueResolve("where", [MOCK_SECTION]);
      // select lesson count = null (edge case)
      mockDb._queueResolve("where", [{ total: null }]);

      await service.updateTotalLessons(TEST_IDS.UUID_1);

      expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ totalLessons: 0 }));
    });
  });

  // ============================================================================
  // generateSlug (private, tested indirectly through create/update)
  // ============================================================================
  describe("slug generation (indirect)", () => {
    it("한국어 제목으로 slug를 생성한다", async () => {
      mockDb._queueResolve("where", [{ max: -1 }]);
      mockDb._queueResolve("returning", [MOCK_COURSE]);

      await service.create({ topicId: TEST_IDS.UUID_2, title: "리액트 기초" }, TEST_USER.id);

      const valuesCall = (mockDb.values as jest.Mock).mock.calls[0][0];
      expect(valuesCall.slug).toMatch(/^리액트-기초-/);
    });

    it("특수문자를 제거하고 하이픈으로 변환한다", async () => {
      mockDb._queueResolve("where", [{ max: -1 }]);
      mockDb._queueResolve("returning", [MOCK_COURSE]);

      await service.create(
        { topicId: TEST_IDS.UUID_2, title: "React & TypeScript!!!" },
        TEST_USER.id,
      );

      const valuesCall = (mockDb.values as jest.Mock).mock.calls[0][0];
      expect(valuesCall.slug).toMatch(/^react-typescript-/);
    });

    it("slug에 타임스탬프를 포함하여 유니크성을 보장한다", async () => {
      mockDb._queueResolve("where", [{ max: -1 }]);
      mockDb._queueResolve("returning", [MOCK_COURSE]);

      await service.create({ topicId: TEST_IDS.UUID_2, title: "Test" }, TEST_USER.id);

      const valuesCall = (mockDb.values as jest.Mock).mock.calls[0][0];
      // slug format: {base}-{timestamp in base36}
      const parts = valuesCall.slug.split("-");
      expect(parts.length).toBeGreaterThanOrEqual(2);
      expect(parts[0]).toBe("test");
    });

    it("선행/후행 하이픈을 제거한다", async () => {
      mockDb._queueResolve("where", [{ max: -1 }]);
      mockDb._queueResolve("returning", [MOCK_COURSE]);

      await service.create({ topicId: TEST_IDS.UUID_2, title: "---Hello World---" }, TEST_USER.id);

      const valuesCall = (mockDb.values as jest.Mock).mock.calls[0][0];
      expect(valuesCall.slug).toMatch(/^hello-world-/);
      expect(valuesCall.slug).not.toMatch(/^-/);
    });
  });
});
