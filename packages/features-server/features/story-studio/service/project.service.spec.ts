jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: "and" })),
  desc: jest.fn((field: any) => ({ field, type: "desc" })),
  count: jest.fn(() => ({ type: "count" })),
}));

jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = jest.requireActual("@nestjs/common");
  const col = (name: string) => ({ name });
  return {
    DRIZZLE: "DRIZZLE_TOKEN",
    InjectDrizzle: () => Inject("DRIZZLE_TOKEN"),
    storyStudioProjects: {
      id: col("id"),
      title: col("title"),
      genre: col("genre"),
      description: col("description"),
      authorId: col("author_id"),
      status: col("status"),
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
import { ProjectService } from "./project.service";
import { createMockDb, TEST_USER } from "../../__test-utils__";

describe("ProjectService", () => {
  let service: ProjectService;
  let mockDb: ReturnType<typeof createMockDb>;

  const mockProject = {
    id: "project-1",
    title: "테스트 게임",
    genre: "어드벤처",
    description: "테스트 설명",
    authorId: TEST_USER.id,
    status: "active",
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        { provide: "DRIZZLE_TOKEN", useValue: mockDb },
      ],
    }).compile();
    service = module.get<ProjectService>(ProjectService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // =========================================================================
  // findAll
  // =========================================================================
  describe("findAll", () => {
    it("프로젝트 목록을 반환한다", async () => {
      mockDb.query.storyStudioProjects.findMany.mockResolvedValue([
        mockProject,
      ]);

      const result = await service.findAll(TEST_USER.id);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("테스트 게임");
    });

    it("빈 목록을 반환한다", async () => {
      mockDb.query.storyStudioProjects.findMany.mockResolvedValue([]);

      const result = await service.findAll(TEST_USER.id);

      expect(result).toHaveLength(0);
    });
  });

  // =========================================================================
  // findById
  // =========================================================================
  describe("findById", () => {
    it("프로젝트를 ID로 조회한다", async () => {
      mockDb.query.storyStudioProjects.findFirst.mockResolvedValue(mockProject);

      const result = await service.findById("project-1");

      expect(result).toEqual(mockProject);
    });

    it("존재하지 않으면 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioProjects.findFirst.mockResolvedValue(null);

      await expect(service.findById("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // create
  // =========================================================================
  describe("create", () => {
    it("프로젝트를 생성한다", async () => {
      mockDb._queueResolve("returning", [mockProject]);

      const result = await service.create(
        { title: "테스트 게임", genre: "어드벤처" },
        TEST_USER.id,
      );

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(mockProject);
    });
  });

  // =========================================================================
  // update
  // =========================================================================
  describe("update", () => {
    it("프로젝트를 수정한다", async () => {
      mockDb.query.storyStudioProjects.findFirst.mockResolvedValue(mockProject);
      mockDb._queueResolve("returning", [
        { ...mockProject, title: "수정됨" },
      ]);

      const result = await service.update("project-1", { title: "수정됨" });

      expect(result.title).toBe("수정됨");
    });

    it("존재하지 않는 프로젝트 수정 시 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioProjects.findFirst.mockResolvedValue(null);

      await expect(
        service.update("nonexistent", { title: "수정됨" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // delete (soft)
  // =========================================================================
  describe("delete", () => {
    it("프로젝트를 소프트 삭제한다", async () => {
      mockDb.query.storyStudioProjects.findFirst.mockResolvedValue(mockProject);

      const result = await service.delete("project-1");

      expect(mockDb.update).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it("존재하지 않는 프로젝트 삭제 시 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioProjects.findFirst.mockResolvedValue(null);

      await expect(service.delete("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
