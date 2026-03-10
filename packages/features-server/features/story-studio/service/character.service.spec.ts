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
    storyStudioCharacters: {
      id: col("id"),
      projectId: col("project_id"),
      name: col("name"),
      code: col("code"),
      role: col("role"),
      personality: col("personality"),
      speechStyle: col("speech_style"),
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
import { CharacterService } from "./character.service";
import { createMockDb, TEST_IDS } from "../../__test-utils__";

describe("CharacterService", () => {
  let service: CharacterService;
  let mockDb: ReturnType<typeof createMockDb>;

  const projectId = TEST_IDS.UUID_1;

  const mockCharacter = {
    id: "char-1",
    projectId,
    name: "주인공",
    code: "HERO",
    role: "protagonist",
    personality: "용감하고 정의로운 성격",
    speechStyle: "존댓말 사용",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CharacterService,
        { provide: "DRIZZLE_TOKEN", useValue: mockDb },
      ],
    }).compile();
    service = module.get<CharacterService>(CharacterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // =========================================================================
  // findByProject
  // =========================================================================
  describe("findByProject", () => {
    it("프로젝트의 캐릭터 목록을 반환한다", async () => {
      mockDb.query.storyStudioCharacters.findMany.mockResolvedValue([
        mockCharacter,
      ]);

      const result = await service.findByProject(projectId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("주인공");
    });

    it("빈 목록을 반환한다", async () => {
      mockDb.query.storyStudioCharacters.findMany.mockResolvedValue([]);

      const result = await service.findByProject(projectId);

      expect(result).toHaveLength(0);
    });
  });

  // =========================================================================
  // findById
  // =========================================================================
  describe("findById", () => {
    it("캐릭터를 ID로 조회한다", async () => {
      mockDb.query.storyStudioCharacters.findFirst.mockResolvedValue(
        mockCharacter,
      );

      const result = await service.findById("char-1");

      expect(result).toEqual(mockCharacter);
    });

    it("존재하지 않으면 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioCharacters.findFirst.mockResolvedValue(null);

      await expect(service.findById("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // create
  // =========================================================================
  describe("create", () => {
    it("캐릭터를 생성한다", async () => {
      mockDb._queueResolve("returning", [mockCharacter]);

      const result = await service.create({
        projectId,
        name: "주인공",
        code: "HERO",
        role: "protagonist",
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(mockCharacter);
    });
  });

  // =========================================================================
  // update
  // =========================================================================
  describe("update", () => {
    it("캐릭터를 수정한다", async () => {
      mockDb.query.storyStudioCharacters.findFirst.mockResolvedValue(
        mockCharacter,
      );
      mockDb._queueResolve("returning", [
        { ...mockCharacter, name: "수정된 캐릭터" },
      ]);

      const result = await service.update("char-1", {
        name: "수정된 캐릭터",
      });

      expect(result.name).toBe("수정된 캐릭터");
    });

    it("존재하지 않는 캐릭터 수정 시 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioCharacters.findFirst.mockResolvedValue(null);

      await expect(
        service.update("nonexistent", { name: "수정됨" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // delete
  // =========================================================================
  describe("delete", () => {
    it("캐릭터를 삭제한다", async () => {
      mockDb.query.storyStudioCharacters.findFirst.mockResolvedValue(
        mockCharacter,
      );

      const result = await service.delete("char-1");

      expect(mockDb.delete).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it("존재하지 않는 캐릭터 삭제 시 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioCharacters.findFirst.mockResolvedValue(null);

      await expect(service.delete("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
