import {
  createMockDb,
  DRIZZLE_ORM_MOCK,
  DRIZZLE_BASE_MOCK_WITH_INJECT,
  createTableMock,
  LOGGER_MOCK,
  TEST_IDS,
  TEST_DATES,
} from "../../__test-utils__";

jest.mock("drizzle-orm", () => DRIZZLE_ORM_MOCK);

jest.mock("@/core/logger", () => LOGGER_MOCK);

jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = jest.requireActual("@nestjs/common");
  return {
    ...DRIZZLE_BASE_MOCK_WITH_INJECT(Inject),
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
  };
});

import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { DRIZZLE } from "@superbuilder/drizzle";
import { TopicService } from "./topic.service";

// ============================================================================
// Test Data
// ============================================================================

const TOPIC_ID = TEST_IDS.UUID_1;
const TOPIC_ID_2 = TEST_IDS.UUID_2;

const MOCK_TOPIC = {
  id: TOPIC_ID,
  name: "프로그래밍",
  slug: "programming",
  description: "프로그래밍 관련 강의",
  thumbnailUrl: null,
  sortOrder: 0,
  isActive: true,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_TOPIC_2 = {
  id: TOPIC_ID_2,
  name: "디자인",
  slug: "design",
  description: "디자인 관련 강의",
  thumbnailUrl: null,
  sortOrder: 1,
  isActive: true,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_INACTIVE_TOPIC = {
  ...MOCK_TOPIC_2,
  id: TEST_IDS.UUID_3,
  name: "비활성 주제",
  slug: "inactive-topic",
  isActive: false,
  sortOrder: 2,
};

describe("TopicService", () => {
  let service: TopicService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TopicService,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<TopicService>(TopicService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // ============================================================================
  // findAll
  // ============================================================================
  describe("findAll", () => {
    it("활성 주제 목록만 반환한다 (기본값)", async () => {
      mockDb._queueResolve("orderBy", [MOCK_TOPIC, MOCK_TOPIC_2]);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(MOCK_TOPIC);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("includeInactive=true이면 비활성 주제도 포함한다", async () => {
      mockDb._queueResolve("orderBy", [MOCK_TOPIC, MOCK_TOPIC_2, MOCK_INACTIVE_TOPIC]);

      const result = await service.findAll(true);

      expect(result).toHaveLength(3);
    });

    it("주제가 없으면 빈 배열을 반환한다", async () => {
      mockDb._queueResolve("orderBy", []);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // findById
  // ============================================================================
  describe("findById", () => {
    it("주제를 ID로 조회한다", async () => {
      mockDb._queueResolve("limit", [MOCK_TOPIC]);

      const result = await service.findById(TOPIC_ID);

      expect(result).toEqual(MOCK_TOPIC);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("존재하지 않으면 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.findById("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("에러 메시지에 ID를 포함한다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.findById("missing-id")).rejects.toThrow(
        "Topic not found: missing-id",
      );
    });
  });

  // ============================================================================
  // create
  // ============================================================================
  describe("create", () => {
    it("새 주제를 생성한다", async () => {
      // slug duplicate check
      mockDb._queueResolve("limit", []);
      // maxOrder query
      mockDb._queueResolve("from", [{ max: 1 }]);
      // insert returning
      mockDb._queueResolve("returning", [{ ...MOCK_TOPIC, sortOrder: 2 }]);

      const result = await service.create({
        name: "프로그래밍",
        slug: "programming",
        description: "프로그래밍 관련 강의",
      });

      expect(result.name).toBe("프로그래밍");
      expect(result.sortOrder).toBe(2);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("slug를 지정하지 않으면 자동 생성한다", async () => {
      // slug duplicate check (auto-generated slug)
      mockDb._queueResolve("limit", []);
      // maxOrder query
      mockDb._queueResolve("from", [{ max: -1 }]);
      // insert returning
      mockDb._queueResolve("returning", [MOCK_TOPIC]);

      const result = await service.create({ name: "프로그래밍" });

      expect(result).toBeDefined();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("슬러그가 중복이면 ConflictException을 던진다", async () => {
      // slug duplicate check returns existing
      mockDb._queueResolve("limit", [MOCK_TOPIC]);

      await expect(
        service.create({ name: "프로그래밍", slug: "programming" }),
      ).rejects.toThrow(ConflictException);
    });

    it("슬러그 중복 에러 메시지에 slug를 포함한다", async () => {
      mockDb._queueResolve("limit", [MOCK_TOPIC]);

      await expect(
        service.create({ name: "프로그래밍", slug: "programming" }),
      ).rejects.toThrow("Slug already exists: programming");
    });

    it("첫 번째 주제는 sortOrder 0으로 생성된다", async () => {
      mockDb._queueResolve("limit", []);
      mockDb._queueResolve("from", [{ max: -1 }]);
      mockDb._queueResolve("returning", [{ ...MOCK_TOPIC, sortOrder: 0 }]);

      const result = await service.create({
        name: "첫 번째 주제",
        slug: "first-topic",
      });

      expect(result.sortOrder).toBe(0);
    });

    it("thumbnailUrl을 포함하여 생성한다", async () => {
      mockDb._queueResolve("limit", []);
      mockDb._queueResolve("from", [{ max: -1 }]);
      mockDb._queueResolve("returning", [
        { ...MOCK_TOPIC, thumbnailUrl: "https://example.com/thumb.jpg" },
      ]);

      const result = await service.create({
        name: "프로그래밍",
        slug: "programming",
        thumbnailUrl: "https://example.com/thumb.jpg",
      });

      expect(result.thumbnailUrl).toBe("https://example.com/thumb.jpg");
    });
  });

  // ============================================================================
  // update
  // ============================================================================
  describe("update", () => {
    it("주제 이름을 수정한다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_TOPIC]);
      // update returning
      mockDb._queueResolve("returning", [{ ...MOCK_TOPIC, name: "웹 개발" }]);

      const result = await service.update(TOPIC_ID, { name: "웹 개발" });

      expect(result.name).toBe("웹 개발");
    });

    it("slug 변경 시 중복 체크를 수행한다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_TOPIC]);
      // slug duplicate check
      mockDb._queueResolve("limit", []);
      // update returning
      mockDb._queueResolve("returning", [{ ...MOCK_TOPIC, slug: "new-slug" }]);

      const result = await service.update(TOPIC_ID, { slug: "new-slug" });

      expect(result.slug).toBe("new-slug");
    });

    it("slug가 다른 주제에서 사용 중이면 ConflictException을 던진다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_TOPIC]);
      // slug duplicate check returns existing (different id)
      mockDb._queueResolve("limit", [MOCK_TOPIC_2]);

      await expect(
        service.update(TOPIC_ID, { slug: "design" }),
      ).rejects.toThrow(ConflictException);
    });

    it("존재하지 않는 주제 수정 시 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(
        service.update("non-existent", { name: "test" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("isActive를 변경할 수 있다", async () => {
      mockDb._queueResolve("limit", [MOCK_TOPIC]);
      mockDb._queueResolve("returning", [{ ...MOCK_TOPIC, isActive: false }]);

      const result = await service.update(TOPIC_ID, { isActive: false });

      expect(result.isActive).toBe(false);
    });

    it("sortOrder를 변경할 수 있다", async () => {
      mockDb._queueResolve("limit", [MOCK_TOPIC]);
      mockDb._queueResolve("returning", [{ ...MOCK_TOPIC, sortOrder: 10 }]);

      const result = await service.update(TOPIC_ID, { sortOrder: 10 });

      expect(result.sortOrder).toBe(10);
    });

    it("description을 변경할 수 있다", async () => {
      mockDb._queueResolve("limit", [MOCK_TOPIC]);
      mockDb._queueResolve("returning", [
        { ...MOCK_TOPIC, description: "새 설명" },
      ]);

      const result = await service.update(TOPIC_ID, { description: "새 설명" });

      expect(result.description).toBe("새 설명");
    });
  });

  // ============================================================================
  // delete
  // ============================================================================
  describe("delete", () => {
    it("연결된 강의가 없으면 주제를 삭제한다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_TOPIC]);
      // course count
      mockDb._queueResolve("where", [{ total: 0 }]);

      const result = await service.delete(TOPIC_ID);

      expect(result).toEqual({ success: true });
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("연결된 강의가 있으면 BadRequestException을 던진다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_TOPIC]);
      // course count returns > 0
      mockDb._queueResolve("where", [{ total: 3 }]);

      await expect(service.delete(TOPIC_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("강의가 있을 때 한국어 에러 메시지를 반환한다", async () => {
      mockDb._queueResolve("limit", [MOCK_TOPIC]);
      mockDb._queueResolve("where", [{ total: 1 }]);

      await expect(service.delete(TOPIC_ID)).rejects.toThrow(
        "이 주제에 강의가 존재합니다",
      );
    });

    it("존재하지 않는 주제 삭제 시 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.delete("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================================================
  // reorder
  // ============================================================================
  describe("reorder", () => {
    it("주제 순서를 변경한다", async () => {
      const items = [
        { id: TOPIC_ID, sortOrder: 1 },
        { id: TOPIC_ID_2, sortOrder: 0 },
      ];

      const result = await service.reorder(items);

      expect(result).toEqual({ success: true });
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it("빈 배열로 호출 시 성공한다", async () => {
      const result = await service.reorder([]);

      expect(result).toEqual({ success: true });
    });

    it("트랜잭션 내에서 각 아이템을 업데이트한다", async () => {
      const txDb = mockDb._tx;
      const items = [
        { id: TOPIC_ID, sortOrder: 2 },
        { id: TOPIC_ID_2, sortOrder: 0 },
        { id: TEST_IDS.UUID_3, sortOrder: 1 },
      ];

      await service.reorder(items);

      expect(txDb.update).toHaveBeenCalledTimes(3);
    });
  });
});
