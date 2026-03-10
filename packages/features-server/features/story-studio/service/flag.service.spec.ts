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
    storyStudioFlags: {
      id: col("id"),
      projectId: col("project_id"),
      name: col("name"),
      type: col("type"),
      defaultValue: col("default_value"),
      category: col("category"),
      description: col("description"),
      isInterpolatable: col("is_interpolatable"),
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
import { FlagService } from "./flag.service";
import { createMockDb, TEST_IDS } from "../../__test-utils__";

describe("FlagService", () => {
  let service: FlagService;
  let mockDb: ReturnType<typeof createMockDb>;

  const projectId = TEST_IDS.UUID_1;

  const mockFlag = {
    id: "flag-1",
    projectId,
    name: "has_key",
    type: "boolean",
    defaultValue: "false",
    category: "quest",
    description: "열쇠 보유 여부",
    isInterpolatable: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlagService,
        { provide: "DRIZZLE_TOKEN", useValue: mockDb },
      ],
    }).compile();
    service = module.get<FlagService>(FlagService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // =========================================================================
  // findByProject
  // =========================================================================
  describe("findByProject", () => {
    it("프로젝트의 플래그 목록을 반환한다", async () => {
      mockDb.query.storyStudioFlags.findMany.mockResolvedValue([mockFlag]);

      const result = await service.findByProject(projectId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("has_key");
    });

    it("빈 목록을 반환한다", async () => {
      mockDb.query.storyStudioFlags.findMany.mockResolvedValue([]);

      const result = await service.findByProject(projectId);

      expect(result).toHaveLength(0);
    });
  });

  // =========================================================================
  // findById
  // =========================================================================
  describe("findById", () => {
    it("플래그를 ID로 조회한다", async () => {
      mockDb.query.storyStudioFlags.findFirst.mockResolvedValue(mockFlag);

      const result = await service.findById("flag-1");

      expect(result).toEqual(mockFlag);
    });

    it("존재하지 않으면 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioFlags.findFirst.mockResolvedValue(null);

      await expect(service.findById("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // create
  // =========================================================================
  describe("create", () => {
    it("플래그를 생성한다", async () => {
      mockDb._queueResolve("returning", [mockFlag]);

      const result = await service.create({
        projectId,
        name: "has_key",
        type: "boolean",
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(mockFlag);
    });
  });

  // =========================================================================
  // update
  // =========================================================================
  describe("update", () => {
    it("플래그를 수정한다", async () => {
      mockDb.query.storyStudioFlags.findFirst.mockResolvedValue(mockFlag);
      mockDb._queueResolve("returning", [
        { ...mockFlag, name: "has_sword" },
      ]);

      const result = await service.update("flag-1", { name: "has_sword" });

      expect(result.name).toBe("has_sword");
    });

    it("존재하지 않는 플래그 수정 시 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioFlags.findFirst.mockResolvedValue(null);

      await expect(
        service.update("nonexistent", { name: "수정됨" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // delete
  // =========================================================================
  describe("delete", () => {
    it("플래그를 삭제한다", async () => {
      mockDb.query.storyStudioFlags.findFirst.mockResolvedValue(mockFlag);

      const result = await service.delete("flag-1");

      expect(mockDb.delete).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it("존재하지 않는 플래그 삭제 시 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioFlags.findFirst.mockResolvedValue(null);

      await expect(service.delete("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
