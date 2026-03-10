import { Test, TestingModule } from "@nestjs/testing";
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ContentThemeService } from "./content-theme.service";
import { createMockDb, TEST_IDS, TEST_DATES } from "../../__test-utils__";

/* ----- drizzle-orm mock ----- */
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: "and" })),
  asc: jest.fn((field: any) => ({ field, type: "asc" })),
  desc: jest.fn((field: any) => ({ field, type: "desc" })),
}));

/* ----- @superbuilder/drizzle mock ----- */
jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = jest.requireActual("@nestjs/common");
  return {
    DRIZZLE: "DRIZZLE_TOKEN",
    InjectDrizzle: () => Inject("DRIZZLE_TOKEN"),
    aiImageContentThemes: {
      id: { name: "id" },
      name: { name: "name" },
      slug: { name: "slug" },
      description: { name: "description" },
      promptTemplate: { name: "prompt_template" },
      recommendedStyleIds: { name: "recommended_style_ids" },
      recommendedFormat: { name: "recommended_format" },
      thumbnailUrl: { name: "thumbnail_url" },
      sortOrder: { name: "sort_order" },
      isActive: { name: "is_active" },
      createdAt: { name: "created_at" },
      updatedAt: { name: "updated_at" },
    },
  };
});

/* ----- @/core/logger mock ----- */
jest.mock("@/core/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

/* ----- Test data ----- */

const MOCK_THEME = {
  id: TEST_IDS.UUID_1,
  name: "제품 소개",
  slug: "제품-소개-test123",
  description: "제품을 소개하는 이미지",
  promptTemplate: "{{product}}의 특징을 보여주는 {{message}}",
  recommendedStyleIds: null,
  recommendedFormat: "feed" as const,
  thumbnailUrl: null,
  sortOrder: 0,
  isActive: true,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_THEME_2 = {
  ...MOCK_THEME,
  id: TEST_IDS.UUID_2,
  name: "프로모션",
  slug: "프로모션-test456",
  promptTemplate: "{{benefit}} 혜택을 강조하는 이미지",
  sortOrder: 1,
};

/* ==========================================================================
 * Tests
 * ========================================================================*/

describe("ContentThemeService", () => {
  let service: ContentThemeService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentThemeService,
        { provide: "DRIZZLE_TOKEN", useValue: mockDb },
      ],
    }).compile();
    service = module.get<ContentThemeService>(ContentThemeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // =========================================================================
  // findActive
  // =========================================================================
  describe("findActive", () => {
    it("활성 테마 목록을 반환한다", async () => {
      mockDb.query.aiImageContentThemes.findMany.mockResolvedValue([
        MOCK_THEME,
        MOCK_THEME_2,
      ]);

      const result = await service.findActive();

      expect(result).toHaveLength(2);
      expect(
        mockDb.query.aiImageContentThemes.findMany,
      ).toHaveBeenCalledTimes(1);
    });

    it("활성 테마가 없으면 빈 배열을 반환한다", async () => {
      mockDb.query.aiImageContentThemes.findMany.mockResolvedValue([]);

      const result = await service.findActive();

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // findById
  // =========================================================================
  describe("findById", () => {
    it("ID로 테마를 조회한다", async () => {
      mockDb.query.aiImageContentThemes.findFirst.mockResolvedValue(
        MOCK_THEME,
      );

      const result = await service.findById(TEST_IDS.UUID_1);

      expect(result).toEqual(MOCK_THEME);
    });

    it("존재하지 않는 테마 조회 시 NotFoundException을 던진다", async () => {
      mockDb.query.aiImageContentThemes.findFirst.mockResolvedValue(null);

      await expect(service.findById("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // create
  // =========================================================================
  describe("create", () => {
    it("테마를 생성한다", async () => {
      // slug 중복 체크 — 기존 없음
      mockDb.query.aiImageContentThemes.findFirst.mockResolvedValue(null);
      // insert().values().returning()
      mockDb._queueResolve("returning", [MOCK_THEME]);

      const result = await service.create({
        name: "제품 소개",
        promptTemplate: "{{product}}의 특징을 보여주는 {{message}}",
      });

      expect(result).toEqual(MOCK_THEME);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("slug 중복 시 ConflictException을 던진다", async () => {
      mockDb.query.aiImageContentThemes.findFirst.mockResolvedValue(
        MOCK_THEME,
      );

      await expect(
        service.create({
          name: "제품 소개",
          promptTemplate: "test",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("DB insert 실패 시 InternalServerErrorException을 던진다", async () => {
      mockDb.query.aiImageContentThemes.findFirst.mockResolvedValue(null);
      mockDb._queueResolve("returning", []);

      await expect(
        service.create({
          name: "테스트",
          promptTemplate: "test",
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // =========================================================================
  // update
  // =========================================================================
  describe("update", () => {
    it("테마를 수정한다", async () => {
      // findById 2회: 존재 확인 + 수정 후 반환
      mockDb.query.aiImageContentThemes.findFirst
        .mockResolvedValueOnce(MOCK_THEME)
        .mockResolvedValueOnce({ ...MOCK_THEME, description: "수정됨" });

      const result = await service.update(TEST_IDS.UUID_1, {
        description: "수정됨",
      });

      expect(result.description).toBe("수정됨");
    });

    it("이름 변경 시 slug 충돌이 있으면 ConflictException을 던진다", async () => {
      // findById: 존재 확인
      mockDb.query.aiImageContentThemes.findFirst
        .mockResolvedValueOnce(MOCK_THEME)
        // slug 충돌 체크: 기존 테마 발견
        .mockResolvedValueOnce(MOCK_THEME_2);

      await expect(
        service.update(TEST_IDS.UUID_1, { name: "새 이름" }),
      ).rejects.toThrow(ConflictException);
    });

    it("이름 변경 시 slug 충돌이 없으면 정상 수정한다", async () => {
      const updatedTheme = { ...MOCK_THEME, name: "새 이름" };
      mockDb.query.aiImageContentThemes.findFirst
        .mockResolvedValueOnce(MOCK_THEME)   // findById: 존재 확인
        .mockResolvedValueOnce(null)          // slug 충돌 체크: 없음
        .mockResolvedValueOnce(updatedTheme); // findById: 수정 후 반환

      const result = await service.update(TEST_IDS.UUID_1, {
        name: "새 이름",
      });

      expect(result.name).toBe("새 이름");
    });

    it("존재하지 않는 테마 수정 시 NotFoundException을 던진다", async () => {
      mockDb.query.aiImageContentThemes.findFirst.mockResolvedValue(null);

      await expect(
        service.update("nonexistent", { description: "test" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // delete
  // =========================================================================
  describe("delete", () => {
    it("테마를 비활성화한다 (soft delete)", async () => {
      mockDb.query.aiImageContentThemes.findFirst.mockResolvedValue(
        MOCK_THEME,
      );

      const result = await service.delete(TEST_IDS.UUID_1);

      expect(result).toEqual({ success: true });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("존재하지 않는 테마 삭제 시 NotFoundException을 던진다", async () => {
      mockDb.query.aiImageContentThemes.findFirst.mockResolvedValue(null);

      await expect(service.delete("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // resolveThemePrompt
  // =========================================================================
  describe("resolveThemePrompt", () => {
    it("템플릿 변수를 치환한다", () => {
      const result = service.resolveThemePrompt(
        "{{product}}의 특징을 보여주는 {{message}}",
        { product: "노트북", message: "광고 이미지" },
      );

      expect(result).toBe("노트북의 특징을 보여주는 광고 이미지");
    });

    it("변수가 없는 템플릿은 그대로 반환한다", () => {
      const result = service.resolveThemePrompt("고정 프롬프트");

      expect(result).toBe("고정 프롬프트");
    });

    it("필수 변수 미입력 시 BadRequestException을 던진다", () => {
      expect(() =>
        service.resolveThemePrompt(
          "{{product}}의 특징을 보여주는 {{message}}",
          { product: "노트북" },
        ),
      ).toThrow(BadRequestException);
    });

    it("빈 문자열 변수는 미입력으로 처리한다", () => {
      expect(() =>
        service.resolveThemePrompt("{{product}} 소개", {
          product: "  ",
        }),
      ).toThrow(BadRequestException);
    });

    it("변수 없이 호출해도 동작한다", () => {
      const result = service.resolveThemePrompt("변수 없는 템플릿");
      expect(result).toBe("변수 없는 템플릿");
    });

    it("중복 변수는 모두 치환한다", () => {
      const result = service.resolveThemePrompt(
        "{{product}} 소개: {{product}}",
        { product: "테스트" },
      );

      expect(result).toBe("테스트 소개: 테스트");
    });
  });
});
