// ============================================================================
// Imports (after mocks)
// ============================================================================
import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { DRIZZLE } from "@superbuilder/drizzle";
import { TEST_DATES, TEST_IDS, TEST_USER, createMockDb } from "../../__test-utils__";
import { CommunityService } from "./community.service";

// ============================================================================
// Mocks (hoisted before imports — cannot reference module-level variables)
// ============================================================================

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: "and" })),
  or: jest.fn((...conditions: any[]) => ({ conditions, type: "or" })),
  not: jest.fn((condition: any) => ({ condition, type: "not" })),
  desc: jest.fn((field: any) => ({ field, type: "desc" })),
  asc: jest.fn((field: any) => ({ field, type: "asc" })),
  count: jest.fn(() => ({ type: "count" })),
  sql: jest.fn((strings: any, ...values: any[]) => ({ strings, values, type: "sql" })),
  ilike: jest.fn((field: any, pattern: any) => ({ field, pattern, type: "ilike" })),
}));

jest.mock("@/core/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = jest.requireActual("@nestjs/common");
  const col = (name: string) => ({ name });
  return {
    DRIZZLE: "DRIZZLE_TOKEN",
    InjectDrizzle: () => Inject("DRIZZLE_TOKEN"),
    communities: {
      id: col("id"),
      name: col("name"),
      slug: col("slug"),
      description: col("description"),
      iconUrl: col("icon_url"),
      bannerUrl: col("banner_url"),
      ownerId: col("owner_id"),
      type: col("type"),
      isOfficial: col("is_official"),
      isNsfw: col("is_nsfw"),
      allowImages: col("allow_images"),
      allowVideos: col("allow_videos"),
      allowPolls: col("allow_polls"),
      allowCrosspost: col("allow_crosspost"),
      memberCount: col("member_count"),
      postCount: col("post_count"),
      onlineCount: col("online_count"),
      rules: col("rules"),
      automodConfig: col("automod_config"),
      bannedWords: col("banned_words"),
      createdAt: col("created_at"),
      updatedAt: col("updated_at"),
    },
    communityMemberships: {
      id: col("id"),
      communityId: col("community_id"),
      userId: col("user_id"),
      role: col("role"),
      joinedAt: col("joined_at"),
      isBanned: col("is_banned"),
      bannedAt: col("banned_at"),
      bannedReason: col("banned_reason"),
      bannedBy: col("banned_by"),
      banExpiresAt: col("ban_expires_at"),
      isMuted: col("is_muted"),
      mutedUntil: col("muted_until"),
      notificationsEnabled: col("notifications_enabled"),
      flairText: col("flair_text"),
      flairColor: col("flair_color"),
    },
    communityModerators: {
      id: col("id"),
      communityId: col("community_id"),
      userId: col("user_id"),
      permissions: col("permissions"),
      appointedBy: col("appointed_by"),
      appointedAt: col("appointed_at"),
    },
    communityPosts: {
      id: col("id"),
      communityId: col("community_id"),
      authorId: col("author_id"),
      title: col("title"),
      content: col("content"),
      type: col("type"),
      status: col("status"),
      createdAt: col("created_at"),
    },
    communityComments: {
      id: col("id"),
      postId: col("post_id"),
      authorId: col("author_id"),
      content: col("content"),
      createdAt: col("created_at"),
    },
  };
});

jest.mock("@/shared/utils/pagination", () => ({
  decodeCursor: jest.fn().mockReturnValue(null),
  buildCursorResult: jest.fn().mockImplementation((items: any[], limit: number) => {
    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    return {
      data,
      nextCursor: hasMore ? "next-cursor-token" : null,
      hasMore,
    };
  }),
}));

// ============================================================================
// Test Data
// ============================================================================

const MOCK_COMMUNITY = {
  id: TEST_IDS.UUID_1,
  name: "Test Community",
  slug: "test-community",
  description: "A test community for unit tests",
  iconUrl: null,
  bannerUrl: null,
  ownerId: TEST_USER.id,
  type: "public" as const,
  isOfficial: false,
  isNsfw: false,
  allowImages: true,
  allowVideos: true,
  allowPolls: true,
  allowCrosspost: true,
  memberCount: 5,
  postCount: 10,
  onlineCount: 2,
  rules: [],
  automodConfig: {},
  bannedWords: [],
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_PRIVATE_COMMUNITY = {
  ...MOCK_COMMUNITY,
  id: TEST_IDS.UUID_2,
  name: "Private Community",
  slug: "private-community",
  type: "private" as const,
};

const MOCK_MEMBERSHIP = {
  id: TEST_IDS.UUID_3,
  communityId: TEST_IDS.UUID_1,
  userId: TEST_USER.id,
  role: "owner" as const,
  joinedAt: TEST_DATES.CREATED,
  isBanned: false,
  bannedAt: null,
  bannedReason: null,
  bannedBy: null,
  banExpiresAt: null,
  isMuted: false,
  mutedUntil: null,
  notificationsEnabled: true,
  flairText: null,
  flairColor: null,
};

const MOCK_MEMBER_MEMBERSHIP = {
  ...MOCK_MEMBERSHIP,
  id: TEST_IDS.UUID_4,
  userId: TEST_IDS.UUID_5,
  role: "member" as const,
};

const OTHER_USER_ID = TEST_IDS.UUID_5;

const CREATE_DTO = {
  name: "New Community",
  slug: "new-community",
  description: "Brand new community for testing",
  type: "public" as const,
  isNsfw: false,
  allowImages: true,
  allowVideos: true,
  allowPolls: true,
  allowCrosspost: true,
  rules: [{ title: "Be nice", description: "Always be respectful" }],
};

const UPDATE_DTO = {
  name: "Updated Community",
  description: "Updated description",
};

// ============================================================================
// Tests
// ============================================================================

describe("CommunityService", () => {
  let service: CommunityService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CommunityService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<CommunityService>(CommunityService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // ============================================================================
  // create
  // ============================================================================
  describe("create", () => {
    it("커뮤니티 생성 성공", async () => {
      // findBySlug returns empty (no duplicate)
      mockDb._queueResolve("limit", []);
      // insert communities returning
      mockDb._queueResolve("returning", [{ ...MOCK_COMMUNITY, memberCount: 0 }]);
      // insert memberships (owner auto-join)
      mockDb._queueResolve("returning", [MOCK_MEMBERSHIP]);
      // update memberCount
      mockDb._queueResolve("where", undefined);

      const result = await service.create(CREATE_DTO, TEST_USER.id);

      expect(result).toBeDefined();
      expect(result.memberCount).toBe(1);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("슬러그 중복 시 ConflictException 발생", async () => {
      // findBySlug returns existing community
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      await expect(service.create(CREATE_DTO, TEST_USER.id)).rejects.toThrow(ConflictException);
    });

    it("슬러그 중복 시 에러 메시지에 슬러그 포함", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      await expect(service.create(CREATE_DTO, TEST_USER.id)).rejects.toThrow(
        /이미 사용 중인 슬러그/,
      );
    });

    it("커뮤니티 생성 실패 시 InternalServerErrorException 발생", async () => {
      // findBySlug returns empty
      mockDb._queueResolve("limit", []);
      // insert returns empty array (no community created)
      mockDb._queueResolve("returning", []);

      await expect(service.create(CREATE_DTO, TEST_USER.id)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it("rules가 없으면 빈 배열을 기본값으로 사용", async () => {
      const dtoWithoutRules = { ...CREATE_DTO, rules: undefined };

      // findBySlug returns empty
      mockDb._queueResolve("limit", []);
      // insert communities returning
      mockDb._queueResolve("returning", [{ ...MOCK_COMMUNITY, memberCount: 0 }]);
      // insert memberships
      mockDb._queueResolve("returning", [MOCK_MEMBERSHIP]);
      // update memberCount
      mockDb._queueResolve("where", undefined);

      const result = await service.create(dtoWithoutRules, TEST_USER.id);

      expect(result).toBeDefined();
      expect(mockDb.values).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // findAll
  // ============================================================================
  describe("findAll", () => {
    const { buildCursorResult, decodeCursor } = jest.requireMock("@/shared/utils/pagination");

    it("기본 옵션으로 커뮤니티 목록 조회", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      const result = await service.findAll();

      expect(buildCursorResult).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("type 필터 적용", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      await service.findAll({ type: "public" });

      expect(mockDb.where).toHaveBeenCalled();
    });

    it("search 필터 적용", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      await service.findAll({ search: "test" });

      expect(mockDb.where).toHaveBeenCalled();
    });

    it("sort = popular 정렬", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      await service.findAll({ sort: "popular" });

      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it("sort = name 정렬", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      await service.findAll({ sort: "name" });

      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it("sort = newest (기본) 정렬", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      await service.findAll({ sort: "newest" });

      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it("cursor가 있을 때 decodeCursor 호출", async () => {
      decodeCursor.mockReturnValueOnce({ value: "2026-01-01", id: TEST_IDS.UUID_1 });
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      await service.findAll({ cursor: "some-cursor", sort: "newest" });

      expect(decodeCursor).toHaveBeenCalledWith("some-cursor");
    });

    it("cursor + sort=popular 조합", async () => {
      decodeCursor.mockReturnValueOnce({ value: "100", id: TEST_IDS.UUID_1 });
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      await service.findAll({ cursor: "cursor-token", sort: "popular" });

      expect(decodeCursor).toHaveBeenCalledWith("cursor-token");
    });

    it("cursor + sort=name 조합", async () => {
      decodeCursor.mockReturnValueOnce({ value: "Alpha", id: TEST_IDS.UUID_1 });
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      await service.findAll({ cursor: "cursor-token", sort: "name" });

      expect(decodeCursor).toHaveBeenCalledWith("cursor-token");
    });

    it("cursor 디코딩 결과가 null이면 cursor 조건 미추가", async () => {
      decodeCursor.mockReturnValueOnce(null);
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      await service.findAll({ cursor: "invalid-cursor" });

      expect(decodeCursor).toHaveBeenCalledWith("invalid-cursor");
    });

    it("limit 옵션 적용 (limit + 1로 조회)", async () => {
      mockDb._queueResolve("limit", []);

      await service.findAll({ limit: 5 });

      expect(mockDb.limit).toHaveBeenCalledWith(6);
    });

    it("빈 결과 반환", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.findAll();

      expect(result.data).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  // ============================================================================
  // findBySlug
  // ============================================================================
  describe("findBySlug", () => {
    it("슬러그로 커뮤니티 조회 성공", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      const result = await service.findBySlug("test-community");

      expect(result).toEqual(MOCK_COMMUNITY);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it("존재하지 않는 슬러그 시 null 반환", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.findBySlug("non-existent");

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // findById
  // ============================================================================
  describe("findById", () => {
    it("ID로 커뮤니티 조회 성공", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      const result = await service.findById(TEST_IDS.UUID_1);

      expect(result).toEqual(MOCK_COMMUNITY);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("존재하지 않는 ID 시 null 반환", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.findById("non-existent-id");

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // findPopular
  // ============================================================================
  describe("findPopular", () => {
    it("인기 커뮤니티 목록 조회 (기본 limit 10)", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      const result = await service.findPopular();

      expect(result).toEqual([MOCK_COMMUNITY]);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.orderBy).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(10);
    });

    it("limit 파라미터 적용", async () => {
      mockDb._queueResolve("limit", []);

      await service.findPopular(5);

      expect(mockDb.limit).toHaveBeenCalledWith(5);
    });

    it("public 타입만 필터", async () => {
      mockDb._queueResolve("limit", []);

      await service.findPopular();

      expect(mockDb.where).toHaveBeenCalled();
    });

    it("빈 결과 반환", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.findPopular();

      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // findUserSubscriptions
  // ============================================================================
  describe("findUserSubscriptions", () => {
    it("사용자 구독 커뮤니티 목록 조회", async () => {
      mockDb._queueResolve("orderBy", [MOCK_COMMUNITY]);

      const result = await service.findUserSubscriptions(TEST_USER.id);

      expect(result).toEqual([MOCK_COMMUNITY]);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.innerJoin).toHaveBeenCalled();
    });

    it("구독 중인 커뮤니티가 없으면 빈 배열 반환", async () => {
      mockDb._queueResolve("orderBy", []);

      const result = await service.findUserSubscriptions(TEST_USER.id);

      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // update
  // ============================================================================
  describe("update", () => {
    it("커뮤니티 업데이트 성공 (owner)", async () => {
      // findBySlug
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      // getMembership
      mockDb._queueResolve("limit", [MOCK_MEMBERSHIP]);
      // update returning
      mockDb._queueResolve("returning", [{ ...MOCK_COMMUNITY, ...UPDATE_DTO }]);

      const result = await service.update("test-community", UPDATE_DTO, TEST_USER.id);

      expect(result.name).toBe("Updated Community");
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("커뮤니티 업데이트 성공 (admin 역할)", async () => {
      const adminMembership = { ...MOCK_MEMBERSHIP, role: "admin" as const, userId: OTHER_USER_ID };

      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("limit", [adminMembership]);
      mockDb._queueResolve("returning", [{ ...MOCK_COMMUNITY, ...UPDATE_DTO }]);

      const result = await service.update("test-community", UPDATE_DTO, OTHER_USER_ID);

      expect(result.name).toBe("Updated Community");
    });

    it("존재하지 않는 커뮤니티 시 NotFoundException 발생", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.update("non-existent", UPDATE_DTO, TEST_USER.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("권한 없는 사용자 시 ForbiddenException 발생 (멤버십 없음)", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("limit", []);

      await expect(service.update("test-community", UPDATE_DTO, OTHER_USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("일반 멤버 시 ForbiddenException 발생", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("limit", [MOCK_MEMBER_MEMBERSHIP]);

      await expect(service.update("test-community", UPDATE_DTO, OTHER_USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("ForbiddenException 메시지 확인", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("limit", [MOCK_MEMBER_MEMBERSHIP]);

      await expect(service.update("test-community", UPDATE_DTO, OTHER_USER_ID)).rejects.toThrow(
        /소유자 또는 관리자만/,
      );
    });
  });

  // ============================================================================
  // delete
  // ============================================================================
  describe("delete", () => {
    it("커뮤니티 삭제 성공 (owner)", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("where", undefined);

      await service.delete("test-community", TEST_USER.id);

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("존재하지 않는 커뮤니티 시 NotFoundException 발생", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.delete("non-existent", TEST_USER.id)).rejects.toThrow(NotFoundException);
    });

    it("소유자가 아닌 사용자 시 ForbiddenException 발생", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      await expect(service.delete("test-community", OTHER_USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("ForbiddenException 메시지 확인", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      await expect(service.delete("test-community", OTHER_USER_ID)).rejects.toThrow(
        /소유자만 삭제/,
      );
    });
  });

  // ============================================================================
  // join
  // ============================================================================
  describe("join", () => {
    it("public 커뮤니티 가입 성공", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("limit", []);
      mockDb._queueResolve("returning", [MOCK_MEMBER_MEMBERSHIP]);
      mockDb._queueResolve("where", undefined);

      const result = await service.join("test-community", OTHER_USER_ID);

      expect(result).toBeDefined();
      expect(result.role).toBe("member");
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("restricted 커뮤니티 가입 성공", async () => {
      const restrictedCommunity = { ...MOCK_COMMUNITY, type: "restricted" as const };
      mockDb._queueResolve("limit", [restrictedCommunity]);
      mockDb._queueResolve("limit", []);
      mockDb._queueResolve("returning", [MOCK_MEMBER_MEMBERSHIP]);
      mockDb._queueResolve("where", undefined);

      const result = await service.join("test-community", OTHER_USER_ID);

      expect(result).toBeDefined();
    });

    it("존재하지 않는 커뮤니티 시 NotFoundException 발생", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.join("non-existent", OTHER_USER_ID)).rejects.toThrow(NotFoundException);
    });

    it("private 커뮤니티 가입 시 ForbiddenException 발생", async () => {
      mockDb._queueResolve("limit", [MOCK_PRIVATE_COMMUNITY]);

      await expect(service.join("private-community", OTHER_USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("private 커뮤니티 ForbiddenException 메시지 확인", async () => {
      mockDb._queueResolve("limit", [MOCK_PRIVATE_COMMUNITY]);

      await expect(service.join("private-community", OTHER_USER_ID)).rejects.toThrow(
        /초대를 통해서만/,
      );
    });

    it("이미 가입된 경우 ConflictException 발생", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("limit", [MOCK_MEMBER_MEMBERSHIP]);

      await expect(service.join("test-community", OTHER_USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it("이미 가입된 경우 ConflictException 메시지 확인", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("limit", [MOCK_MEMBER_MEMBERSHIP]);

      await expect(service.join("test-community", OTHER_USER_ID)).rejects.toThrow(
        /이미 이 커뮤니티에 가입/,
      );
    });

    it("가입 후 memberCount 증가", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("limit", []);
      mockDb._queueResolve("returning", [MOCK_MEMBER_MEMBERSHIP]);
      mockDb._queueResolve("where", undefined);

      await service.join("test-community", OTHER_USER_ID);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // leave
  // ============================================================================
  describe("leave", () => {
    it("커뮤니티 탈퇴 성공", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("limit", [MOCK_MEMBER_MEMBERSHIP]);
      mockDb._queueResolve("where", undefined);
      mockDb._queueResolve("where", undefined);

      await service.leave("test-community", OTHER_USER_ID);

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("존재하지 않는 커뮤니티 시 NotFoundException 발생", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.leave("non-existent", OTHER_USER_ID)).rejects.toThrow(NotFoundException);
    });

    it("소유자가 탈퇴 시 ForbiddenException 발생", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      await expect(service.leave("test-community", TEST_USER.id)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("소유자 탈퇴 ForbiddenException 메시지 확인", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);

      await expect(service.leave("test-community", TEST_USER.id)).rejects.toThrow(
        /소유자는 탈퇴할 수 없습니다/,
      );
    });

    it("멤버가 아닌 경우 NotFoundException 발생", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("limit", []);

      await expect(service.leave("test-community", OTHER_USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("멤버가 아닌 경우 NotFoundException 메시지 확인", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("limit", []);

      await expect(service.leave("test-community", OTHER_USER_ID)).rejects.toThrow(
        /멤버가 아닙니다/,
      );
    });

    it("탈퇴 후 memberCount 감소", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("limit", [MOCK_MEMBER_MEMBERSHIP]);
      mockDb._queueResolve("where", undefined);
      mockDb._queueResolve("where", undefined);

      await service.leave("test-community", OTHER_USER_ID);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // getMembers
  // ============================================================================
  describe("getMembers", () => {
    it("커뮤니티 멤버 목록 조회 (기본 옵션)", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("offset", [MOCK_MEMBERSHIP, MOCK_MEMBER_MEMBERSHIP]);
      mockDb._queueResolve("where", [{ count: 2 }]);

      const result = await service.getMembers("test-community");

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it("페이지네이션 옵션 적용", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("offset", [MOCK_MEMBERSHIP]);
      mockDb._queueResolve("where", [{ count: 10 }]);

      const result = await service.getMembers("test-community", { page: 2, limit: 5 });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(5);
      expect(result.hasMore).toBe(true);
    });

    it("존재하지 않는 커뮤니티 시 NotFoundException 발생", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.getMembers("non-existent")).rejects.toThrow(NotFoundException);
    });

    it("멤버가 없으면 빈 목록 반환", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("offset", []);
      mockDb._queueResolve("where", [{ count: 0 }]);

      const result = await service.getMembers("test-community");

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it("totalResult 빈 배열이면 total 0 반환", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("offset", []);
      mockDb._queueResolve("where", []);

      const result = await service.getMembers("test-community");

      expect(result.total).toBe(0);
    });
  });

  // ============================================================================
  // getModerators
  // ============================================================================
  describe("getModerators", () => {
    const MOCK_MODERATOR = {
      id: TEST_IDS.UUID_3,
      communityId: TEST_IDS.UUID_1,
      userId: OTHER_USER_ID,
      permissions: {
        managePosts: true,
        manageComments: true,
        manageUsers: true,
        manageFlairs: false,
        manageRules: false,
        manageSettings: false,
        manageModerators: false,
        viewModLog: true,
        viewReports: true,
      },
      appointedBy: TEST_USER.id,
      appointedAt: TEST_DATES.CREATED,
    };

    it("모더레이터 목록 조회 성공", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("orderBy", [MOCK_MODERATOR]);

      const result = await service.getModerators("test-community");

      expect(result).toEqual([MOCK_MODERATOR]);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("존재하지 않는 커뮤니티 시 NotFoundException 발생", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.getModerators("non-existent")).rejects.toThrow(NotFoundException);
    });

    it("모더레이터가 없으면 빈 배열 반환", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("orderBy", []);

      const result = await service.getModerators("test-community");

      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // getMembership
  // ============================================================================
  describe("getMembership", () => {
    it("멤버십 조회 성공", async () => {
      mockDb._queueResolve("limit", [MOCK_MEMBERSHIP]);

      const result = await service.getMembership(TEST_IDS.UUID_1, TEST_USER.id);

      expect(result).toEqual(MOCK_MEMBERSHIP);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it("멤버십이 없으면 null 반환", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.getMembership(TEST_IDS.UUID_1, OTHER_USER_ID);

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // isMember
  // ============================================================================
  describe("isMember", () => {
    it("멤버인 경우 true 반환", async () => {
      mockDb._queueResolve("limit", [MOCK_MEMBERSHIP]);

      const result = await service.isMember(TEST_IDS.UUID_1, TEST_USER.id);

      expect(result).toBe(true);
    });

    it("밴된 경우 false 반환", async () => {
      mockDb._queueResolve("limit", [{ ...MOCK_MEMBERSHIP, isBanned: true }]);

      const result = await service.isMember(TEST_IDS.UUID_1, TEST_USER.id);

      expect(result).toBe(false);
    });

    it("멤버십이 없는 경우 false 반환", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.isMember(TEST_IDS.UUID_1, OTHER_USER_ID);

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // isModerator
  // ============================================================================
  describe("isModerator", () => {
    it("moderator 역할이면 true 반환", async () => {
      mockDb._queueResolve("limit", [{ ...MOCK_MEMBERSHIP, role: "moderator" }]);

      const result = await service.isModerator(TEST_IDS.UUID_1, TEST_USER.id);

      expect(result).toBe(true);
    });

    it("admin 역할이면 true 반환", async () => {
      mockDb._queueResolve("limit", [{ ...MOCK_MEMBERSHIP, role: "admin" }]);

      const result = await service.isModerator(TEST_IDS.UUID_1, TEST_USER.id);

      expect(result).toBe(true);
    });

    it("owner 역할이면 true 반환", async () => {
      mockDb._queueResolve("limit", [{ ...MOCK_MEMBERSHIP, role: "owner" }]);

      const result = await service.isModerator(TEST_IDS.UUID_1, TEST_USER.id);

      expect(result).toBe(true);
    });

    it("member 역할이면 false 반환", async () => {
      mockDb._queueResolve("limit", [MOCK_MEMBER_MEMBERSHIP]);

      const result = await service.isModerator(TEST_IDS.UUID_1, OTHER_USER_ID);

      expect(result).toBe(false);
    });

    it("멤버십이 없으면 false 반환", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.isModerator(TEST_IDS.UUID_1, OTHER_USER_ID);

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // adminFindAll
  // ============================================================================
  describe("adminFindAll", () => {
    it("[Admin] 커뮤니티 목록 조회 (기본)", async () => {
      mockDb._queueResolve("offset", [MOCK_COMMUNITY]);
      mockDb._queueResolve("where", [{ count: 1 }]);

      const result = await service.adminFindAll({ page: 1, limit: 10 });

      expect(result.data).toEqual([MOCK_COMMUNITY]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it("[Admin] type 필터 적용", async () => {
      mockDb._queueResolve("offset", [MOCK_COMMUNITY]);
      mockDb._queueResolve("where", [{ count: 1 }]);

      const result = await service.adminFindAll({ page: 1, limit: 10, type: "public" });

      expect(result.data).toEqual([MOCK_COMMUNITY]);
    });

    it("[Admin] search 필터 적용", async () => {
      mockDb._queueResolve("offset", [MOCK_COMMUNITY]);
      mockDb._queueResolve("where", [{ count: 1 }]);

      const result = await service.adminFindAll({ page: 1, limit: 10, search: "test" });

      expect(result.data).toEqual([MOCK_COMMUNITY]);
    });

    it("[Admin] type + search 동시 필터 적용", async () => {
      mockDb._queueResolve("offset", [MOCK_COMMUNITY]);
      mockDb._queueResolve("where", [{ count: 1 }]);

      const result = await service.adminFindAll({
        page: 1,
        limit: 10,
        type: "public",
        search: "test",
      });

      expect(result.data).toEqual([MOCK_COMMUNITY]);
    });

    it("[Admin] 빈 결과 반환", async () => {
      mockDb._queueResolve("offset", []);
      mockDb._queueResolve("where", [{ count: 0 }]);

      const result = await service.adminFindAll({ page: 1, limit: 10 });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it("[Admin] totalResult 빈 배열일 때 total 0 반환", async () => {
      mockDb._queueResolve("offset", []);
      mockDb._queueResolve("where", []);

      const result = await service.adminFindAll({ page: 1, limit: 10 });

      expect(result.total).toBe(0);
    });

    it("[Admin] totalPages 계산 정확성 (25/10 = 3)", async () => {
      mockDb._queueResolve("offset", [MOCK_COMMUNITY]);
      mockDb._queueResolve("where", [{ count: 25 }]);

      const result = await service.adminFindAll({ page: 1, limit: 10 });

      expect(result.totalPages).toBe(3);
    });

    it("[Admin] 필터 없이 conditions 빈 배열", async () => {
      mockDb._queueResolve("offset", [MOCK_COMMUNITY]);
      mockDb._queueResolve("where", [{ count: 1 }]);

      const result = await service.adminFindAll({ page: 1, limit: 10 });

      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // adminDelete
  // ============================================================================
  describe("adminDelete", () => {
    it("[Admin] 커뮤니티 삭제 성공", async () => {
      mockDb._queueResolve("limit", [MOCK_COMMUNITY]);
      mockDb._queueResolve("where", undefined);

      const result = await service.adminDelete(TEST_IDS.UUID_1);

      expect(result).toEqual({ success: true });
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("[Admin] 존재하지 않는 커뮤니티 시 NotFoundException 발생", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.adminDelete("non-existent-id")).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // getSystemStats
  // ============================================================================
  describe("getSystemStats", () => {
    it("전체 시스템 통계 반환", async () => {
      // select({count}).from(table) resolves at "from" — no where clause
      mockDb._queueResolve("from", [{ count: 10 }]);
      mockDb._queueResolve("from", [{ count: 100 }]);
      mockDb._queueResolve("from", [{ count: 500 }]);
      mockDb._queueResolve("from", [{ count: 2000 }]);

      const result = await service.getSystemStats();

      expect(result).toEqual({
        totalCommunities: 10,
        totalMembers: 100,
        totalPosts: 500,
        totalComments: 2000,
      });
    });

    it("빈 데이터일 때 모두 0 반환", async () => {
      mockDb._queueResolve("from", [{ count: 0 }]);
      mockDb._queueResolve("from", [{ count: 0 }]);
      mockDb._queueResolve("from", [{ count: 0 }]);
      mockDb._queueResolve("from", [{ count: 0 }]);

      const result = await service.getSystemStats();

      expect(result).toEqual({
        totalCommunities: 0,
        totalMembers: 0,
        totalPosts: 0,
        totalComments: 0,
      });
    });

    it("count 결과가 빈 배열일 때 0 반환", async () => {
      mockDb._queueResolve("from", []);
      mockDb._queueResolve("from", []);
      mockDb._queueResolve("from", []);
      mockDb._queueResolve("from", []);

      const result = await service.getSystemStats();

      expect(result).toEqual({
        totalCommunities: 0,
        totalMembers: 0,
        totalPosts: 0,
        totalComments: 0,
      });
    });
  });
});
