import {
  createMockDb,
  DRIZZLE_ORM_MOCK,
  DRIZZLE_BASE_MOCK_WITH_INJECT,
  createTableMock,
  LOGGER_MOCK,
  TEST_USER,
  TEST_IDS,
  TEST_DATES,
} from "../../__test-utils__";

jest.mock("drizzle-orm", () => DRIZZLE_ORM_MOCK);

jest.mock("@/core/logger", () => LOGGER_MOCK);

jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = jest.requireActual("@nestjs/common");
  return {
    ...DRIZZLE_BASE_MOCK_WITH_INJECT(Inject),
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
  };
});

import { NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { DRIZZLE } from "@superbuilder/drizzle";
import { SectionService } from "./section.service";

// ============================================================================
// Test Data
// ============================================================================

const COURSE_ID = TEST_IDS.UUID_1;
const SECTION_ID = TEST_IDS.UUID_2;
const SECTION_ID_2 = TEST_IDS.UUID_3;

const MOCK_SECTION = {
  id: SECTION_ID,
  courseId: COURSE_ID,
  title: "섹션 1: 시작하기",
  description: "입문 섹션입니다",
  sortOrder: 0,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_SECTION_2 = {
  id: SECTION_ID_2,
  courseId: COURSE_ID,
  title: "섹션 2: 심화",
  description: "심화 섹션입니다",
  sortOrder: 1,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_LESSON = {
  id: TEST_IDS.UUID_4,
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

describe("SectionService", () => {
  let service: SectionService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SectionService,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<SectionService>(SectionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // ============================================================================
  // findByCourseId
  // ============================================================================
  describe("findByCourseId", () => {
    it("강의의 섹션 목록을 레슨 포함하여 반환한다", async () => {
      mockDb._queueResolve("orderBy", [MOCK_SECTION, MOCK_SECTION_2]);
      // lessons for section 1
      mockDb._queueResolve("orderBy", [MOCK_LESSON]);
      // lessons for section 2
      mockDb._queueResolve("orderBy", []);

      const result = await service.findByCourseId(COURSE_ID);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ ...MOCK_SECTION, lessons: [MOCK_LESSON] });
      expect(result[1]).toEqual({ ...MOCK_SECTION_2, lessons: [] });
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("섹션이 없으면 빈 배열을 반환한다", async () => {
      mockDb._queueResolve("orderBy", []);

      const result = await service.findByCourseId(COURSE_ID);

      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // findById
  // ============================================================================
  describe("findById", () => {
    it("섹션을 ID로 조회한다", async () => {
      mockDb._queueResolve("limit", [MOCK_SECTION]);

      const result = await service.findById(SECTION_ID);

      expect(result).toEqual(MOCK_SECTION);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("섹션이 존재하지 않으면 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.findById("non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("에러 메시지에 ID를 포함한다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.findById("non-existent-id")).rejects.toThrow(
        "Section not found: non-existent-id",
      );
    });
  });

  // ============================================================================
  // create
  // ============================================================================
  describe("create", () => {
    it("새 섹션을 생성한다", async () => {
      // maxOrder query
      mockDb._queueResolve("where", [{ max: 1 }]);
      // insert returning
      mockDb._queueResolve("returning", [{ ...MOCK_SECTION, sortOrder: 2 }]);

      const result = await service.create({
        courseId: COURSE_ID,
        title: "섹션 1: 시작하기",
        description: "입문 섹션입니다",
      });

      expect(result.courseId).toBe(COURSE_ID);
      expect(result.sortOrder).toBe(2);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("기존 섹션이 없으면 sortOrder 0으로 생성한다", async () => {
      // maxOrder query returns -1 (COALESCE default)
      mockDb._queueResolve("where", [{ max: -1 }]);
      mockDb._queueResolve("returning", [{ ...MOCK_SECTION, sortOrder: 0 }]);

      const result = await service.create({
        courseId: COURSE_ID,
        title: "첫 번째 섹션",
      });

      expect(result.sortOrder).toBe(0);
    });

    it("maxOrder가 null이면 sortOrder 0으로 생성한다", async () => {
      mockDb._queueResolve("where", [{ max: null }]);
      mockDb._queueResolve("returning", [{ ...MOCK_SECTION, sortOrder: 0 }]);

      const result = await service.create({
        courseId: COURSE_ID,
        title: "첫 번째 섹션",
      });

      expect(result.sortOrder).toBe(0);
    });

    it("description 없이 섹션을 생성할 수 있다", async () => {
      mockDb._queueResolve("where", [{ max: -1 }]);
      mockDb._queueResolve("returning", [
        { ...MOCK_SECTION, description: undefined, sortOrder: 0 },
      ]);

      const result = await service.create({
        courseId: COURSE_ID,
        title: "설명 없는 섹션",
      });

      expect(result).toBeDefined();
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // update
  // ============================================================================
  describe("update", () => {
    it("섹션 제목을 수정한다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_SECTION]);
      // update returning
      mockDb._queueResolve("returning", [{ ...MOCK_SECTION, title: "수정된 제목" }]);

      const result = await service.update(SECTION_ID, { title: "수정된 제목" });

      expect(result.title).toBe("수정된 제목");
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("섹션 설명을 수정한다", async () => {
      mockDb._queueResolve("limit", [MOCK_SECTION]);
      mockDb._queueResolve("returning", [
        { ...MOCK_SECTION, description: "새 설명" },
      ]);

      const result = await service.update(SECTION_ID, { description: "새 설명" });

      expect(result.description).toBe("새 설명");
    });

    it("sortOrder를 수정한다", async () => {
      mockDb._queueResolve("limit", [MOCK_SECTION]);
      mockDb._queueResolve("returning", [{ ...MOCK_SECTION, sortOrder: 5 }]);

      const result = await service.update(SECTION_ID, { sortOrder: 5 });

      expect(result.sortOrder).toBe(5);
    });

    it("존재하지 않는 섹션 수정 시 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(
        service.update("non-existent", { title: "test" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // delete
  // ============================================================================
  describe("delete", () => {
    it("섹션과 하위 레슨을 삭제한다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_SECTION]);

      const result = await service.delete(SECTION_ID);

      expect(result).toEqual({ success: true, courseId: COURSE_ID });
      // delete lessons first, then section
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
    });

    it("존재하지 않는 섹션 삭제 시 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.delete("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("삭제 결과에 courseId를 포함한다", async () => {
      mockDb._queueResolve("limit", [MOCK_SECTION]);

      const result = await service.delete(SECTION_ID);

      expect(result.courseId).toBe(COURSE_ID);
    });
  });

  // ============================================================================
  // reorder
  // ============================================================================
  describe("reorder", () => {
    it("섹션 순서를 변경한다", async () => {
      const items = [
        { id: SECTION_ID, sortOrder: 1 },
        { id: SECTION_ID_2, sortOrder: 0 },
      ];

      const result = await service.reorder(items);

      expect(result).toEqual({ success: true });
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it("빈 배열로 reorder 호출 시 성공한다", async () => {
      const result = await service.reorder([]);

      expect(result).toEqual({ success: true });
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it("트랜잭션 내에서 각 아이템을 업데이트한다", async () => {
      const txDb = mockDb._tx;
      const items = [
        { id: SECTION_ID, sortOrder: 2 },
        { id: SECTION_ID_2, sortOrder: 0 },
      ];

      await service.reorder(items);

      expect(txDb.update).toHaveBeenCalledTimes(2);
    });
  });
});
