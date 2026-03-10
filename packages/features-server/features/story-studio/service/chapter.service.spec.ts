jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: "and" })),
  asc: jest.fn((field: any) => ({ field, type: "asc" })),
  desc: jest.fn((field: any) => ({ field, type: "desc" })),
  count: jest.fn(() => ({ type: "count" })),
}));

jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = jest.requireActual("@nestjs/common");
  const col = (name: string) => ({ name });
  return {
    DRIZZLE: "DRIZZLE_TOKEN",
    InjectDrizzle: () => Inject("DRIZZLE_TOKEN"),
    storyStudioChapters: {
      id: col("id"),
      projectId: col("project_id"),
      title: col("title"),
      code: col("code"),
      order: col("order"),
      summary: col("summary"),
      status: col("status"),
      estimatedPlaytime: col("estimated_playtime"),
      isDeleted: col("is_deleted"),
      deletedAt: col("deleted_at"),
      createdAt: col("created_at"),
      updatedAt: col("updated_at"),
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

import { Test, type TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ChapterService } from "./chapter.service";
import { createMockDb, TEST_IDS } from "../../__test-utils__";

describe("ChapterService", () => {
  let service: ChapterService;
  let mockDb: ReturnType<typeof createMockDb>;

  const projectId = TEST_IDS.UUID_1;

  const mockChapter = {
    id: "chapter-1",
    projectId,
    title: "1장: 시작",
    code: "CH01",
    order: 0,
    summary: "첫 번째 챕터",
    status: "outline",
    estimatedPlaytime: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChapterService,
        { provide: "DRIZZLE_TOKEN", useValue: mockDb },
      ],
    }).compile();
    service = module.get<ChapterService>(ChapterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // =========================================================================
  // findByProject
  // =========================================================================
  describe("findByProject", () => {
    it("프로젝트의 챕터 목록을 반환한다", async () => {
      mockDb.query.storyStudioChapters.findMany.mockResolvedValue([
        mockChapter,
      ]);

      const result = await service.findByProject(projectId);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("1장: 시작");
    });

    it("빈 목록을 반환한다", async () => {
      mockDb.query.storyStudioChapters.findMany.mockResolvedValue([]);

      const result = await service.findByProject(projectId);

      expect(result).toHaveLength(0);
    });
  });

  // =========================================================================
  // findById
  // =========================================================================
  describe("findById", () => {
    it("챕터를 ID로 조회한다", async () => {
      mockDb.query.storyStudioChapters.findFirst.mockResolvedValue(mockChapter);

      const result = await service.findById("chapter-1");

      expect(result).toEqual(mockChapter);
    });

    it("존재하지 않으면 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioChapters.findFirst.mockResolvedValue(null);

      await expect(service.findById("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // create
  // =========================================================================
  describe("create", () => {
    it("챕터를 생성한다", async () => {
      mockDb._queueResolve("returning", [mockChapter]);

      const result = await service.create(
        { title: "1장: 시작", code: "CH01" },
        projectId,
      );

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(mockChapter);
    });
  });

  // =========================================================================
  // update
  // =========================================================================
  describe("update", () => {
    it("챕터를 수정한다", async () => {
      mockDb.query.storyStudioChapters.findFirst.mockResolvedValue(mockChapter);
      mockDb._queueResolve("returning", [
        { ...mockChapter, title: "수정됨" },
      ]);

      const result = await service.update("chapter-1", { title: "수정됨" });

      expect(result.title).toBe("수정됨");
    });

    it("존재하지 않는 챕터 수정 시 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioChapters.findFirst.mockResolvedValue(null);

      await expect(
        service.update("nonexistent", { title: "수정됨" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // reorder
  // =========================================================================
  describe("reorder", () => {
    it("챕터 순서를 재배열한다", async () => {
      const result = await service.reorder(projectId, [
        "chapter-2",
        "chapter-1",
      ]);

      expect(mockDb.update).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  // =========================================================================
  // delete (soft)
  // =========================================================================
  describe("delete", () => {
    it("챕터를 소프트 삭제한다", async () => {
      mockDb.query.storyStudioChapters.findFirst.mockResolvedValue(mockChapter);

      const result = await service.delete("chapter-1");

      expect(mockDb.update).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it("존재하지 않는 챕터 삭제 시 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioChapters.findFirst.mockResolvedValue(null);

      await expect(service.delete("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
