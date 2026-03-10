jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
  inArray: jest.fn((field: any, values: any) => ({
    field,
    values,
    type: "inArray",
  })),
}));

jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = require("@nestjs/common");
  return {
    DRIZZLE: "DRIZZLE_TOKEN",
    InjectDrizzle: () => Inject("DRIZZLE_TOKEN"),
    userKarma: {
      userId: { name: "user_id" },
      postKarma: { name: "post_karma" },
      commentKarma: { name: "comment_karma" },
      totalKarma: { name: "total_karma" },
      updatedAt: { name: "updated_at" },
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
import { DRIZZLE } from "@superbuilder/drizzle";
import { CommunityKarmaService } from "./community-karma.service";
import { createMockDb, TEST_USER, TEST_IDS, TEST_DATES } from "../../__test-utils__";

// ============================================================================
// Test Constants
// ============================================================================

const USER_A_ID = TEST_USER.id;
const USER_B_ID = TEST_IDS.UUID_1;
const USER_C_ID = TEST_IDS.UUID_2;
const USER_D_ID = TEST_IDS.UUID_3;

const MOCK_KARMA_A = {
  userId: USER_A_ID,
  postKarma: 150,
  commentKarma: 75,
  totalKarma: 225,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_KARMA_B = {
  userId: USER_B_ID,
  postKarma: 30,
  commentKarma: 10,
  totalKarma: 40,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_KARMA_C = {
  userId: USER_C_ID,
  postKarma: 0,
  commentKarma: 5,
  totalKarma: 5,
  updatedAt: TEST_DATES.UPDATED,
};

describe("CommunityKarmaService", () => {
  let service: CommunityKarmaService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityKarmaService,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<CommunityKarmaService>(CommunityKarmaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // ============================================================================
  // getKarma
  // ============================================================================
  describe("getKarma", () => {
    it("기존 karma 레코드가 있으면 해당 karma를 반환한다", async () => {
      mockDb._queueResolve("limit", [MOCK_KARMA_A]);

      const result = await service.getKarma(USER_A_ID);

      expect(result).toEqual({
        userId: USER_A_ID,
        postKarma: 150,
        commentKarma: 75,
        totalKarma: 225,
      });
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it("karma 레코드가 없으면 기본값(모두 0)을 반환한다", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.getKarma(USER_A_ID);

      expect(result).toEqual({
        userId: USER_A_ID,
        postKarma: 0,
        commentKarma: 0,
        totalKarma: 0,
      });
    });

    it("undefined 결과에서도 기본값을 반환한다", async () => {
      mockDb._queueResolve("limit", [undefined]);

      const result = await service.getKarma(USER_A_ID);

      expect(result).toEqual({
        userId: USER_A_ID,
        postKarma: 0,
        commentKarma: 0,
        totalKarma: 0,
      });
    });

    it("postKarma만 있고 commentKarma가 0인 사용자를 올바르게 반환한다", async () => {
      const karmaPostOnly = {
        ...MOCK_KARMA_A,
        userId: USER_B_ID,
        postKarma: 100,
        commentKarma: 0,
        totalKarma: 100,
      };
      mockDb._queueResolve("limit", [karmaPostOnly]);

      const result = await service.getKarma(USER_B_ID);

      expect(result.postKarma).toBe(100);
      expect(result.commentKarma).toBe(0);
      expect(result.totalKarma).toBe(100);
    });

    it("commentKarma만 있고 postKarma가 0인 사용자를 올바르게 반환한다", async () => {
      mockDb._queueResolve("limit", [MOCK_KARMA_C]);

      const result = await service.getKarma(USER_C_ID);

      expect(result.postKarma).toBe(0);
      expect(result.commentKarma).toBe(5);
      expect(result.totalKarma).toBe(5);
    });

    it("반환값에는 updatedAt 필드가 포함되지 않는다", async () => {
      mockDb._queueResolve("limit", [MOCK_KARMA_A]);

      const result = await service.getKarma(USER_A_ID);

      expect(result).not.toHaveProperty("updatedAt");
      expect(Object.keys(result)).toEqual([
        "userId",
        "postKarma",
        "commentKarma",
        "totalKarma",
      ]);
    });
  });

  // ============================================================================
  // getBatchKarma
  // ============================================================================
  describe("getBatchKarma", () => {
    it("빈 배열을 전달하면 빈 배열을 반환한다", async () => {
      const result = await service.getBatchKarma([]);

      expect(result).toEqual([]);
      // select should not be called
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it("여러 사용자의 karma를 일괄 조회한다", async () => {
      mockDb._queueResolve("where", [MOCK_KARMA_A, MOCK_KARMA_B]);

      const result = await service.getBatchKarma([USER_A_ID, USER_B_ID]);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        userId: USER_A_ID,
        postKarma: 150,
        commentKarma: 75,
        totalKarma: 225,
      });
      expect(result[1]).toEqual({
        userId: USER_B_ID,
        postKarma: 30,
        commentKarma: 10,
        totalKarma: 40,
      });
    });

    it("karma 레코드가 없는 사용자는 기본값(모두 0)으로 반환된다", async () => {
      // Only return karma for USER_A, not for USER_D
      mockDb._queueResolve("where", [MOCK_KARMA_A]);

      const result = await service.getBatchKarma([USER_A_ID, USER_D_ID]);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        userId: USER_A_ID,
        postKarma: 150,
        commentKarma: 75,
        totalKarma: 225,
      });
      expect(result[1]).toEqual({
        userId: USER_D_ID,
        postKarma: 0,
        commentKarma: 0,
        totalKarma: 0,
      });
    });

    it("중복된 userId가 있으면 고유한 ID만으로 조회하고 중복 없이 반환한다", async () => {
      mockDb._queueResolve("where", [MOCK_KARMA_A]);

      const result = await service.getBatchKarma([USER_A_ID, USER_A_ID, USER_A_ID]);

      expect(result).toHaveLength(1);
      expect(result[0]!.userId).toBe(USER_A_ID);
    });

    it("모든 사용자에 karma 레코드가 없으면 모두 기본값을 반환한다", async () => {
      mockDb._queueResolve("where", []);

      const result = await service.getBatchKarma([USER_A_ID, USER_B_ID, USER_C_ID]);

      expect(result).toHaveLength(3);
      result.forEach((karma) => {
        expect(karma.postKarma).toBe(0);
        expect(karma.commentKarma).toBe(0);
        expect(karma.totalKarma).toBe(0);
      });
    });

    it("단일 사용자를 조회해도 배열로 반환한다", async () => {
      mockDb._queueResolve("where", [MOCK_KARMA_B]);

      const result = await service.getBatchKarma([USER_B_ID]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        userId: USER_B_ID,
        postKarma: 30,
        commentKarma: 10,
        totalKarma: 40,
      });
    });

    it("반환 순서는 입력된 userIds 순서를 따른다", async () => {
      // Return in DB order (B, A) but input order is (A, B)
      mockDb._queueResolve("where", [MOCK_KARMA_B, MOCK_KARMA_A]);

      const result = await service.getBatchKarma([USER_A_ID, USER_B_ID]);

      expect(result[0]!.userId).toBe(USER_A_ID);
      expect(result[1]!.userId).toBe(USER_B_ID);
    });

    it("일부만 존재하는 경우 순서를 유지하면서 없는 항목은 기본값으로 반환한다", async () => {
      mockDb._queueResolve("where", [MOCK_KARMA_B]);

      const result = await service.getBatchKarma([USER_A_ID, USER_B_ID, USER_C_ID]);

      expect(result).toHaveLength(3);
      // USER_A — not found, default
      expect(result[0]).toEqual({
        userId: USER_A_ID,
        postKarma: 0,
        commentKarma: 0,
        totalKarma: 0,
      });
      // USER_B — found
      expect(result[1]).toEqual({
        userId: USER_B_ID,
        postKarma: 30,
        commentKarma: 10,
        totalKarma: 40,
      });
      // USER_C — not found, default
      expect(result[2]).toEqual({
        userId: USER_C_ID,
        postKarma: 0,
        commentKarma: 0,
        totalKarma: 0,
      });
    });

    it("반환값에는 updatedAt 필드가 포함되지 않는다", async () => {
      mockDb._queueResolve("where", [MOCK_KARMA_A]);

      const result = await service.getBatchKarma([USER_A_ID]);

      expect(result[0]).not.toHaveProperty("updatedAt");
    });
  });
});
