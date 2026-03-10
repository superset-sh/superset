// ============================================================================
// Imports (after mocks)
// ============================================================================
import { Test, type TestingModule } from "@nestjs/testing";
import { DRIZZLE } from "@superbuilder/drizzle";
import { TEST_DATES, TEST_IDS, TEST_USER, createMockDb } from "../../__test-utils__";
import { CommunityFeedService } from "./community-feed.service";

// ============================================================================
// Mocks (hoisted before imports — cannot reference module-level variables)
// ============================================================================

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: "and" })),
  or: jest.fn((...conditions: any[]) => ({ conditions, type: "or" })),
  desc: jest.fn((field: any) => ({ field, type: "desc" })),
  asc: jest.fn((field: any) => ({ field, type: "asc" })),
  count: jest.fn(() => ({ type: "count" })),
  sql: jest.fn((strings: any, ...values: any[]) => ({ strings, values, type: "sql" })),
  inArray: jest.fn((field: any, values: any) => ({ field, values, type: "inArray" })),
  gte: jest.fn((field: any, value: any) => ({ field, value, type: "gte" })),
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
      ownerId: col("owner_id"),
      type: col("type"),
      memberCount: col("member_count"),
      createdAt: col("created_at"),
      updatedAt: col("updated_at"),
    },
    communityPosts: {
      id: col("id"),
      communityId: col("community_id"),
      authorId: col("author_id"),
      title: col("title"),
      content: col("content"),
      type: col("type"),
      status: col("status"),
      isPinned: col("is_pinned"),
      isLocked: col("is_locked"),
      viewCount: col("view_count"),
      upvoteCount: col("upvote_count"),
      downvoteCount: col("downvote_count"),
      voteScore: col("vote_score"),
      commentCount: col("comment_count"),
      hotScore: col("hot_score"),
      createdAt: col("created_at"),
      updatedAt: col("updated_at"),
      lastActivityAt: col("last_activity_at"),
    },
    communityMemberships: {
      id: col("id"),
      communityId: col("community_id"),
      userId: col("user_id"),
      role: col("role"),
      joinedAt: col("joined_at"),
      isBanned: col("is_banned"),
    },
  };
});

// ============================================================================
// Test Data
// ============================================================================

const MOCK_POST = {
  id: TEST_IDS.UUID_1,
  communityId: TEST_IDS.UUID_2,
  authorId: TEST_USER.id,
  title: "Test Post",
  content: "Test content",
  type: "text" as const,
  status: "published" as const,
  isPinned: false,
  isLocked: false,
  viewCount: 100,
  upvoteCount: 10,
  downvoteCount: 2,
  voteScore: 8,
  commentCount: 5,
  hotScore: 50.0,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
  lastActivityAt: TEST_DATES.UPDATED,
};

const MOCK_POST_2 = {
  ...MOCK_POST,
  id: TEST_IDS.UUID_3,
  title: "Second Post",
  voteScore: 20,
  hotScore: 80.0,
};

const MOCK_COMMUNITY_ID = TEST_IDS.UUID_2;
const MOCK_COMMUNITY_ID_2 = TEST_IDS.UUID_4;

const MOCK_MEMBERSHIP = {
  communityId: MOCK_COMMUNITY_ID,
};

const MOCK_FEED_RESULT = {
  post: MOCK_POST,
  communitySlug: "test-community",
};

const MOCK_FEED_RESULT_2 = {
  post: MOCK_POST_2,
  communitySlug: "another-community",
};

// ============================================================================
// Tests
// ============================================================================

describe("CommunityFeedService", () => {
  let service: CommunityFeedService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CommunityFeedService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<CommunityFeedService>(CommunityFeedService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // ============================================================================
  // getHomeFeed
  // ============================================================================
  describe("getHomeFeed", () => {
    it("구독한 커뮤니티의 피드 조회 성공", async () => {
      // memberships query
      mockDb._queueResolve("where", [{ communityId: MOCK_COMMUNITY_ID }]);
      // getFeed query with offset
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getHomeFeed(TEST_USER.id);

      expect(result).toBeDefined();
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toHaveProperty("communitySlug", "test-community");
      expect(result.page).toBe(1);
      expect(result.limit).toBe(25);
    });

    it("구독한 커뮤니티가 없으면 빈 결과 반환", async () => {
      // memberships returns empty
      mockDb._queueResolve("where", []);

      const result = await service.getHomeFeed(TEST_USER.id);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it("커스텀 페이지와 limit 옵션 사용", async () => {
      mockDb._queueResolve("where", [{ communityId: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getHomeFeed(TEST_USER.id, { page: 2, limit: 10 });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });

    it("빈 구독 시 커스텀 limit 반환", async () => {
      mockDb._queueResolve("where", []);

      const result = await service.getHomeFeed(TEST_USER.id, { limit: 50 });

      expect(result.limit).toBe(50);
    });

    it("여러 커뮤니티 구독 시 모든 결과 반환", async () => {
      mockDb._queueResolve("where", [
        { communityId: MOCK_COMMUNITY_ID },
        { communityId: MOCK_COMMUNITY_ID_2 },
      ]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT, MOCK_FEED_RESULT_2]);

      const result = await service.getHomeFeed(TEST_USER.id);

      expect(result.items).toHaveLength(2);
    });

    it("sort = hot 옵션 적용", async () => {
      mockDb._queueResolve("where", [{ communityId: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getHomeFeed(TEST_USER.id, { sort: "hot" });

      expect(result).toBeDefined();
      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it("sort = top 옵션 적용", async () => {
      mockDb._queueResolve("where", [{ communityId: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getHomeFeed(TEST_USER.id, { sort: "top" });

      expect(result).toBeDefined();
      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it("sort = new 옵션 적용 (기본 정렬)", async () => {
      mockDb._queueResolve("where", [{ communityId: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getHomeFeed(TEST_USER.id, { sort: "new" });

      expect(result).toBeDefined();
      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it("sort = rising 옵션 적용", async () => {
      mockDb._queueResolve("where", [{ communityId: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getHomeFeed(TEST_USER.id, { sort: "rising" });

      expect(result).toBeDefined();
    });

    it("sort = controversial 옵션 적용", async () => {
      mockDb._queueResolve("where", [{ communityId: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getHomeFeed(TEST_USER.id, { sort: "controversial" });

      expect(result).toBeDefined();
      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it("timeFilter = day 옵션 적용", async () => {
      mockDb._queueResolve("where", [{ communityId: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getHomeFeed(TEST_USER.id, { timeFilter: "day" });

      expect(result).toBeDefined();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it("timeFilter = all 옵션 시 시간 필터링 미적용", async () => {
      mockDb._queueResolve("where", [{ communityId: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getHomeFeed(TEST_USER.id, { timeFilter: "all" });

      expect(result).toBeDefined();
    });

    it("hasMore는 items.length === limit 일 때 true", async () => {
      const manyResults = Array.from({ length: 25 }, (_, i) => ({
        post: { ...MOCK_POST, id: `post-${i}` },
        communitySlug: "test-community",
      }));

      mockDb._queueResolve("where", [{ communityId: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", manyResults);

      const result = await service.getHomeFeed(TEST_USER.id, { limit: 25 });

      expect(result.hasMore).toBe(true);
    });

    it("hasMore는 items.length < limit 일 때 false", async () => {
      mockDb._queueResolve("where", [{ communityId: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getHomeFeed(TEST_USER.id, { limit: 25 });

      expect(result.hasMore).toBe(false);
    });
  });

  // ============================================================================
  // getAllFeed
  // ============================================================================
  describe("getAllFeed", () => {
    it("공개 커뮤니티 전체 피드 조회 성공", async () => {
      // public communities query
      mockDb._queueResolve("where", [{ id: MOCK_COMMUNITY_ID }]);
      // getFeed query with offset
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getAllFeed();

      expect(result).toBeDefined();
      expect(result.items).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(25);
    });

    it("커스텀 옵션으로 전체 피드 조회", async () => {
      mockDb._queueResolve("where", [{ id: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getAllFeed({ page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
    });

    it("공개 커뮤니티가 여러 개인 경우 모든 게시물 반환", async () => {
      mockDb._queueResolve("where", [
        { id: MOCK_COMMUNITY_ID },
        { id: MOCK_COMMUNITY_ID_2 },
      ]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT, MOCK_FEED_RESULT_2]);

      const result = await service.getAllFeed();

      expect(result.items).toHaveLength(2);
    });

    it("sort = hot 옵션 적용", async () => {
      mockDb._queueResolve("where", [{ id: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getAllFeed({ sort: "hot" });

      expect(result).toBeDefined();
      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it("timeFilter = week 옵션 적용", async () => {
      mockDb._queueResolve("where", [{ id: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getAllFeed({ timeFilter: "week" });

      expect(result).toBeDefined();
    });

    it("timeFilter = month 옵션 적용", async () => {
      mockDb._queueResolve("where", [{ id: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getAllFeed({ timeFilter: "month" });

      expect(result).toBeDefined();
    });

    it("timeFilter = year 옵션 적용", async () => {
      mockDb._queueResolve("where", [{ id: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getAllFeed({ timeFilter: "year" });

      expect(result).toBeDefined();
    });

    it("timeFilter = hour 옵션 적용", async () => {
      mockDb._queueResolve("where", [{ id: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getAllFeed({ timeFilter: "hour" });

      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // getPopularFeed
  // ============================================================================
  describe("getPopularFeed", () => {
    it("인기 피드 조회 성공 (기본 옵션)", async () => {
      mockDb._queueResolve("limit", [MOCK_POST, MOCK_POST_2]);

      const result = await service.getPopularFeed();

      expect(result).toHaveLength(2);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it("커스텀 limit 적용", async () => {
      mockDb._queueResolve("limit", [MOCK_POST]);

      const result = await service.getPopularFeed({ limit: 5 });

      expect(result).toBeDefined();
      expect(mockDb.limit).toHaveBeenCalled();
    });

    it("timeFilter = hour 적용", async () => {
      mockDb._queueResolve("limit", [MOCK_POST]);

      const result = await service.getPopularFeed({ timeFilter: "hour" });

      expect(result).toBeDefined();
    });

    it("timeFilter = day 적용 (기본값)", async () => {
      mockDb._queueResolve("limit", [MOCK_POST]);

      const result = await service.getPopularFeed({ timeFilter: "day" });

      expect(result).toBeDefined();
    });

    it("timeFilter = week 적용", async () => {
      mockDb._queueResolve("limit", [MOCK_POST]);

      const result = await service.getPopularFeed({ timeFilter: "week" });

      expect(result).toBeDefined();
    });

    it("timeFilter = month 적용", async () => {
      mockDb._queueResolve("limit", [MOCK_POST]);

      const result = await service.getPopularFeed({ timeFilter: "month" });

      expect(result).toBeDefined();
    });

    it("timeFilter = year 적용", async () => {
      mockDb._queueResolve("limit", [MOCK_POST]);

      const result = await service.getPopularFeed({ timeFilter: "year" });

      expect(result).toBeDefined();
    });

    it("timeFilter = all 적용 (startDate = epoch)", async () => {
      mockDb._queueResolve("limit", [MOCK_POST]);

      const result = await service.getPopularFeed({ timeFilter: "all" });

      expect(result).toBeDefined();
    });

    it("빈 결과 반환", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.getPopularFeed();

      expect(result).toEqual([]);
    });

    it("옵션 없이 기본 limit 25 적용", async () => {
      mockDb._queueResolve("limit", []);

      await service.getPopularFeed();

      expect(mockDb.limit).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // getFeed (private, tested indirectly)
  // ============================================================================
  describe("getFeed (via getHomeFeed/getAllFeed)", () => {
    it("기본 페이지 및 limit 설정", async () => {
      mockDb._queueResolve("where", [{ communityId: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", []);

      const result = await service.getHomeFeed(TEST_USER.id);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(25);
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("결과를 post와 communitySlug로 flatten", async () => {
      mockDb._queueResolve("where", [{ communityId: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      const result = await service.getHomeFeed(TEST_USER.id);

      expect(result.items[0]).toHaveProperty("title", "Test Post");
      expect(result.items[0]).toHaveProperty("communitySlug", "test-community");
    });

    it("sort 미지정 시 createdAt 기준 정렬 (new)", async () => {
      mockDb._queueResolve("where", [{ communityId: MOCK_COMMUNITY_ID }]);
      mockDb._queueResolve("offset", [MOCK_FEED_RESULT]);

      await service.getHomeFeed(TEST_USER.id, {});

      expect(mockDb.orderBy).toHaveBeenCalled();
    });
  });
});
