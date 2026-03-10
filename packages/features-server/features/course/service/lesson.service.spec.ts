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
    courseSections: createTableMock({
      id: "id",
      courseId: "course_id",
      title: "title",
      description: "description",
      sortOrder: "sort_order",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }),
    files: createTableMock({
      id: "id",
      name: "name",
      originalName: "original_name",
      mimeType: "mime_type",
      size: "size",
      url: "url",
      uploadedById: "uploaded_by_id",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }),
  };
});

import { NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { DRIZZLE } from "@superbuilder/drizzle";
import { LessonService } from "./lesson.service";

// ============================================================================
// Test Data
// ============================================================================

const COURSE_ID = TEST_IDS.UUID_1;
const SECTION_ID = TEST_IDS.UUID_2;
const LESSON_ID = TEST_IDS.UUID_3;
const LESSON_ID_2 = TEST_IDS.UUID_4;
const VIDEO_FILE_ID = TEST_IDS.UUID_5;

const MOCK_LESSON = {
  id: LESSON_ID,
  sectionId: SECTION_ID,
  title: "레슨 1: 변수와 타입",
  description: "변수와 타입에 대해 배웁니다",
  videoFileId: null,
  videoDurationSeconds: null,
  sortOrder: 0,
  isFree: false,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_LESSON_WITH_VIDEO = {
  ...MOCK_LESSON,
  id: LESSON_ID_2,
  title: "레슨 2: 함수",
  videoFileId: VIDEO_FILE_ID,
  videoDurationSeconds: 600,
  sortOrder: 1,
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

describe("LessonService", () => {
  let service: LessonService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LessonService,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<LessonService>(LessonService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // ============================================================================
  // findById
  // ============================================================================
  describe("findById", () => {
    it("레슨을 ID로 조회한다", async () => {
      mockDb._queueResolve("limit", [MOCK_LESSON]);

      const result = await service.findById(LESSON_ID);

      expect(result).toEqual(MOCK_LESSON);
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
        "Lesson not found: missing-id",
      );
    });
  });

  // ============================================================================
  // findByIdWithVideo
  // ============================================================================
  describe("findByIdWithVideo", () => {
    it("비디오가 없는 레슨은 videoUrl: null로 반환한다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_LESSON]);

      const result = await service.findByIdWithVideo(LESSON_ID);

      expect(result.videoUrl).toBeNull();
      expect(result.id).toBe(LESSON_ID);
    });

    it("비디오가 있는 레슨은 videoUrl을 포함하여 반환한다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_LESSON_WITH_VIDEO]);
      // file query
      mockDb._queueResolve("limit", [{ url: "https://cdn.example.com/video.mp4" }]);

      const result = await service.findByIdWithVideo(LESSON_ID_2);

      expect(result.videoUrl).toBe("https://cdn.example.com/video.mp4");
      expect(result.videoFileId).toBe(VIDEO_FILE_ID);
    });

    it("비디오 파일이 존재하지 않으면 videoUrl: null로 반환한다", async () => {
      mockDb._queueResolve("limit", [MOCK_LESSON_WITH_VIDEO]);
      // file query returns empty
      mockDb._queueResolve("limit", []);

      const result = await service.findByIdWithVideo(LESSON_ID_2);

      expect(result.videoUrl).toBeNull();
    });

    it("레슨이 존재하지 않으면 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.findByIdWithVideo("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================================================
  // getCourseIdByLessonId
  // ============================================================================
  describe("getCourseIdByLessonId", () => {
    it("레슨이 속한 강의 ID를 반환한다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_LESSON]);
      // section query
      mockDb._queueResolve("limit", [{ courseId: COURSE_ID }]);

      const result = await service.getCourseIdByLessonId(LESSON_ID);

      expect(result).toBe(COURSE_ID);
    });

    it("레슨이 존재하지 않으면 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(
        service.getCourseIdByLessonId("non-existent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("섹션이 존재하지 않으면 NotFoundException을 던진다", async () => {
      // findById returns lesson
      mockDb._queueResolve("limit", [MOCK_LESSON]);
      // section query returns empty
      mockDb._queueResolve("limit", []);

      await expect(
        service.getCourseIdByLessonId(LESSON_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it("섹션 미존재 에러 메시지에 레슨 ID를 포함한다", async () => {
      mockDb._queueResolve("limit", [MOCK_LESSON]);
      mockDb._queueResolve("limit", []);

      await expect(
        service.getCourseIdByLessonId(LESSON_ID),
      ).rejects.toThrow(`Section not found for lesson: ${LESSON_ID}`);
    });
  });

  // ============================================================================
  // create
  // ============================================================================
  describe("create", () => {
    it("새 레슨을 생성한다", async () => {
      // maxOrder query
      mockDb._queueResolve("where", [{ max: 0 }]);
      // insert returning
      mockDb._queueResolve("returning", [{ ...MOCK_LESSON, sortOrder: 1 }]);

      const result = await service.create({
        sectionId: SECTION_ID,
        title: "레슨 1: 변수와 타입",
        description: "변수와 타입에 대해 배웁니다",
      });

      expect(result.sectionId).toBe(SECTION_ID);
      expect(result.sortOrder).toBe(1);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("첫 번째 레슨은 sortOrder 0으로 생성된다", async () => {
      mockDb._queueResolve("where", [{ max: -1 }]);
      mockDb._queueResolve("returning", [{ ...MOCK_LESSON, sortOrder: 0 }]);

      const result = await service.create({
        sectionId: SECTION_ID,
        title: "첫 번째 레슨",
      });

      expect(result.sortOrder).toBe(0);
    });

    it("isFree 옵션을 지정할 수 있다", async () => {
      mockDb._queueResolve("where", [{ max: -1 }]);
      mockDb._queueResolve("returning", [{ ...MOCK_LESSON, isFree: true }]);

      const result = await service.create({
        sectionId: SECTION_ID,
        title: "무료 레슨",
        isFree: true,
      });

      expect(result.isFree).toBe(true);
    });

    it("isFree 기본값은 false이다", async () => {
      mockDb._queueResolve("where", [{ max: -1 }]);
      mockDb._queueResolve("returning", [{ ...MOCK_LESSON, isFree: false }]);

      const result = await service.create({
        sectionId: SECTION_ID,
        title: "기본 레슨",
      });

      expect(result.isFree).toBe(false);
    });

    it("maxOrder가 null이면 sortOrder 0으로 생성한다", async () => {
      mockDb._queueResolve("where", [{ max: null }]);
      mockDb._queueResolve("returning", [{ ...MOCK_LESSON, sortOrder: 0 }]);

      const result = await service.create({
        sectionId: SECTION_ID,
        title: "첫 레슨",
      });

      expect(result.sortOrder).toBe(0);
    });
  });

  // ============================================================================
  // update
  // ============================================================================
  describe("update", () => {
    it("레슨 제목을 수정한다", async () => {
      mockDb._queueResolve("limit", [MOCK_LESSON]);
      mockDb._queueResolve("returning", [{ ...MOCK_LESSON, title: "수정된 제목" }]);

      const result = await service.update(LESSON_ID, { title: "수정된 제목" });

      expect(result.title).toBe("수정된 제목");
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("레슨 설명을 수정한다", async () => {
      mockDb._queueResolve("limit", [MOCK_LESSON]);
      mockDb._queueResolve("returning", [
        { ...MOCK_LESSON, description: "새 설명" },
      ]);

      const result = await service.update(LESSON_ID, { description: "새 설명" });

      expect(result.description).toBe("새 설명");
    });

    it("sortOrder를 수정한다", async () => {
      mockDb._queueResolve("limit", [MOCK_LESSON]);
      mockDb._queueResolve("returning", [{ ...MOCK_LESSON, sortOrder: 3 }]);

      const result = await service.update(LESSON_ID, { sortOrder: 3 });

      expect(result.sortOrder).toBe(3);
    });

    it("isFree를 수정한다", async () => {
      mockDb._queueResolve("limit", [MOCK_LESSON]);
      mockDb._queueResolve("returning", [{ ...MOCK_LESSON, isFree: true }]);

      const result = await service.update(LESSON_ID, { isFree: true });

      expect(result.isFree).toBe(true);
    });

    it("존재하지 않는 레슨 수정 시 NotFoundException을 던진다", async () => {
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
    it("레슨을 삭제하고 courseId를 반환한다", async () => {
      // getCourseIdByLessonId -> findById
      mockDb._queueResolve("limit", [MOCK_LESSON]);
      // getCourseIdByLessonId -> section query
      mockDb._queueResolve("limit", [{ courseId: COURSE_ID }]);

      const result = await service.delete(LESSON_ID);

      expect(result).toEqual({ success: true, courseId: COURSE_ID });
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("레슨이 존재하지 않으면 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.delete("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("섹션이 존재하지 않으면 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", [MOCK_LESSON]);
      mockDb._queueResolve("limit", []);

      await expect(service.delete(LESSON_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================================================
  // setVideo
  // ============================================================================
  describe("setVideo", () => {
    it("레슨에 비디오를 설정한다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_LESSON]);
      // update returning
      mockDb._queueResolve("returning", [
        {
          ...MOCK_LESSON,
          videoFileId: VIDEO_FILE_ID,
          videoDurationSeconds: 300,
        },
      ]);

      const result = await service.setVideo(LESSON_ID, {
        videoFileId: VIDEO_FILE_ID,
        videoDurationSeconds: 300,
      });

      expect(result.videoFileId).toBe(VIDEO_FILE_ID);
      expect(result.videoDurationSeconds).toBe(300);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("존재하지 않는 레슨에 비디오 설정 시 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(
        service.setVideo("non-existent", {
          videoFileId: VIDEO_FILE_ID,
          videoDurationSeconds: 300,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // removeVideo
  // ============================================================================
  describe("removeVideo", () => {
    it("레슨에서 비디오를 제거한다", async () => {
      // findById
      mockDb._queueResolve("limit", [MOCK_LESSON_WITH_VIDEO]);
      // update returning
      mockDb._queueResolve("returning", [
        {
          ...MOCK_LESSON_WITH_VIDEO,
          videoFileId: null,
          videoDurationSeconds: null,
        },
      ]);

      const result = await service.removeVideo(LESSON_ID_2);

      expect(result.videoFileId).toBeNull();
      expect(result.videoDurationSeconds).toBeNull();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("존재하지 않는 레슨에서 비디오 제거 시 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.removeVideo("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("비디오가 없는 레슨에서도 제거가 성공한다", async () => {
      mockDb._queueResolve("limit", [MOCK_LESSON]);
      mockDb._queueResolve("returning", [
        { ...MOCK_LESSON, videoFileId: null, videoDurationSeconds: null },
      ]);

      const result = await service.removeVideo(LESSON_ID);

      expect(result.videoFileId).toBeNull();
      expect(result.videoDurationSeconds).toBeNull();
    });
  });

  // ============================================================================
  // reorder
  // ============================================================================
  describe("reorder", () => {
    it("레슨 순서를 변경한다", async () => {
      const items = [
        { id: LESSON_ID, sortOrder: 1 },
        { id: LESSON_ID_2, sortOrder: 0 },
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
        { id: LESSON_ID, sortOrder: 2 },
        { id: LESSON_ID_2, sortOrder: 0 },
      ];

      await service.reorder(items);

      expect(txDb.update).toHaveBeenCalledTimes(2);
    });
  });
});
