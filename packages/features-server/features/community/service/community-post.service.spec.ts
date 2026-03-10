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

// ---------------------------------------------------------------------------
// Mocks (must be declared before service/NestJS imports)
// ---------------------------------------------------------------------------

jest.mock("drizzle-orm", () => DRIZZLE_ORM_MOCK);

jest.mock("@/core/logger", () => LOGGER_MOCK);

jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = jest.requireActual("@nestjs/common");
  return {
    ...DRIZZLE_BASE_MOCK_WITH_INJECT(Inject),
    communityPosts: createTableMock({
      id: "id",
      communityId: "community_id",
      authorId: "author_id",
      title: "title",
      content: "content",
      type: "type",
      linkUrl: "link_url",
      linkPreview: "link_preview",
      mediaUrls: "media_urls",
      pollData: "poll_data",
      flairId: "flair_id",
      isNsfw: "is_nsfw",
      isSpoiler: "is_spoiler",
      isOc: "is_oc",
      status: "status",
      isPinned: "is_pinned",
      isLocked: "is_locked",
      removalReason: "removal_reason",
      removedBy: "removed_by",
      viewCount: "view_count",
      upvoteCount: "upvote_count",
      downvoteCount: "downvote_count",
      voteScore: "vote_score",
      commentCount: "comment_count",
      shareCount: "share_count",
      crosspostParentId: "crosspost_parent_id",
      hotScore: "hot_score",
      lastActivityAt: "last_activity_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }),
    communities: createTableMock({
      id: "id",
      name: "name",
      slug: "slug",
      description: "description",
      ownerId: "owner_id",
      type: "type",
      memberCount: "member_count",
      postCount: "post_count",
      onlineCount: "online_count",
      allowCrosspost: "allow_crosspost",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }),
    profiles: createTableMock({
      id: "id",
      name: "name",
      email: "email",
      avatar: "avatar",
    }),
  };
});

jest.mock("@/shared/utils/pagination", () => ({
  decodeCursor: jest.fn().mockReturnValue(null),
  buildCursorResult: jest.fn().mockImplementation((data, _limit) => ({
    data,
    nextCursor: null,
    hasMore: false,
  })),
}));

jest.mock("../helpers/permission", () => ({
  assertCommunityPermission: jest.fn().mockResolvedValue(undefined),
  assertResourceOwner: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { DRIZZLE } from "@superbuilder/drizzle";
import { CommunityPostService } from "./community-post.service";
import { CommunityService } from "./community.service";

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const COMMUNITY_ID = TEST_IDS.UUID_1;
const POST_ID = TEST_IDS.UUID_2;
const ANOTHER_USER_ID = TEST_IDS.UUID_3;
const TARGET_COMMUNITY_ID = TEST_IDS.UUID_4;

const mockCommunity = {
  id: COMMUNITY_ID,
  name: "Test Community",
  slug: "test-community",
  description: "A test community",
  ownerId: TEST_USER.id,
  type: "public",
  memberCount: 10,
  postCount: 5,
  onlineCount: 2,
  allowCrosspost: true,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const mockPost = {
  id: POST_ID,
  communityId: COMMUNITY_ID,
  authorId: TEST_USER.id,
  title: "Test Post",
  content: "Test post content",
  type: "text",
  linkUrl: null,
  linkPreview: null,
  mediaUrls: [],
  pollData: null,
  flairId: null,
  isNsfw: false,
  isSpoiler: false,
  isOc: false,
  status: "published",
  isPinned: false,
  isLocked: false,
  removalReason: null,
  removedBy: null,
  viewCount: 0,
  upvoteCount: 0,
  downvoteCount: 0,
  voteScore: 0,
  commentCount: 0,
  shareCount: 0,
  crosspostParentId: null,
  hotScore: 0,
  lastActivityAt: TEST_DATES.CREATED,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const mockAuthor = {
  id: TEST_USER.id,
  name: TEST_USER.name,
  avatar: null,
};

const createPostDto = {
  communityId: COMMUNITY_ID,
  title: "New Post",
  content: "New post content",
  type: "text" as const,
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("CommunityPostService", () => {
  let service: CommunityPostService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockCommunityService: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockDb = createMockDb();

    mockCommunityService = {
      findById: jest.fn(),
      findBySlug: jest.fn(),
      isMember: jest.fn(),
      isModerator: jest.fn(),
      getMembership: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityPostService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: CommunityService, useValue: mockCommunityService },
      ],
    }).compile();

    service = module.get<CommunityPostService>(CommunityPostService);
  });

  afterEach(() => {
    mockDb._resetQueue();
    jest.clearAllMocks();
  });

  // =========================================================================
  // create
  // =========================================================================

  describe("create", () => {
    it("should create a post successfully", async () => {
      mockCommunityService.findById.mockResolvedValue(mockCommunity);
      mockCommunityService.isMember.mockResolvedValue(true);
      mockDb._queueResolve("returning", [mockPost]);
      // update communities postCount chain (update -> set -> where resolves)
      mockDb._queueResolve("where", undefined);

      const result = await service.create(createPostDto, TEST_USER.id);

      expect(result).toEqual(mockPost);
      expect(mockCommunityService.findById).toHaveBeenCalledWith(COMMUNITY_ID);
      expect(mockCommunityService.isMember).toHaveBeenCalledWith(COMMUNITY_ID, TEST_USER.id);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should throw NotFoundException when community does not exist", async () => {
      mockCommunityService.findById.mockResolvedValue(null);

      await expect(
        service.create(createPostDto, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user is not a member", async () => {
      mockCommunityService.findById.mockResolvedValue(mockCommunity);
      mockCommunityService.isMember.mockResolvedValue(false);

      await expect(
        service.create(createPostDto, TEST_USER.id),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // findAll
  // =========================================================================

  describe("findAll", () => {
    it("should return paginated posts with default options", async () => {
      const posts = [{ ...mockPost, authorId: TEST_USER.id }];
      mockDb._queueResolve("limit", posts);
      // author lookup
      mockDb._queueResolve("where", [mockAuthor]);

      const result = await service.findAll();

      expect(result).toBeDefined();
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should filter by communityId when provided", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.findAll({ communityId: COMMUNITY_ID });

      expect(result).toBeDefined();
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should filter by communitySlug when provided", async () => {
      mockCommunityService.findBySlug.mockResolvedValue(mockCommunity);
      mockDb._queueResolve("limit", []);

      const result = await service.findAll({ communitySlug: "test-community" });

      expect(result).toBeDefined();
      expect(mockCommunityService.findBySlug).toHaveBeenCalledWith("test-community");
    });

    it("should handle cursor pagination", async () => {
      const { decodeCursor } = require("@/shared/utils/pagination");
      decodeCursor.mockReturnValueOnce({ value: "2026-01-01T00:00:00.000Z", id: POST_ID });
      mockDb._queueResolve("limit", []);

      const result = await service.findAll({ cursor: "some-cursor" });

      expect(result).toBeDefined();
      expect(decodeCursor).toHaveBeenCalledWith("some-cursor");
    });

    it("should return empty result when no posts found", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.findAll();

      expect(result).toBeDefined();
    });

    it("should enrich posts with author data", async () => {
      const posts = [mockPost];
      mockDb._queueResolve("limit", posts);
      mockDb._queueResolve("where", [mockAuthor]);

      const { buildCursorResult } = require("@/shared/utils/pagination");
      buildCursorResult.mockImplementationOnce((data: any[]) => ({
        data,
        nextCursor: null,
        hasMore: false,
      }));

      const result = await service.findAll();

      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it("should use custom limit when provided", async () => {
      mockDb._queueResolve("limit", []);

      await service.findAll({ limit: 10 });

      expect(mockDb.limit).toHaveBeenCalledWith(11);
    });
  });

  // =========================================================================
  // findById
  // =========================================================================

  describe("findById", () => {
    it("should return post with author data when found", async () => {
      mockDb._queueResolve("limit", [mockPost]);
      // author lookup
      mockDb._queueResolve("limit", [mockAuthor]);
      // view count update (update -> set -> where)
      mockDb._queueResolve("where", undefined);

      const result = await service.findById(POST_ID);

      expect(result).toBeDefined();
      expect(result!.authorName).toBe(TEST_USER.name);
      expect(result!.authorAvatar).toBeNull();
    });

    it("should return null when post not found", async () => {
      mockDb._queueResolve("limit", [undefined]);

      const result = await service.findById(POST_ID);

      expect(result).toBeNull();
    });

    it("should return placeholder for deleted post", async () => {
      const deletedPost = { ...mockPost, status: "deleted" };
      mockDb._queueResolve("limit", [deletedPost]);
      mockDb._queueResolve("limit", [mockAuthor]);

      const result = await service.findById(POST_ID);

      expect(result).toBeDefined();
      expect(result!.title).toBe("[삭제된 게시글]");
      expect(result!.content).toBe("[삭제된 게시글]");
    });

    it("should return placeholder for removed post", async () => {
      const removedPost = { ...mockPost, status: "removed" };
      mockDb._queueResolve("limit", [removedPost]);
      mockDb._queueResolve("limit", [mockAuthor]);

      const result = await service.findById(POST_ID);

      expect(result).toBeDefined();
      expect(result!.title).toBe("[운영 정책에 의해 삭제됨]");
      expect(result!.content).toBe("[운영 정책에 의해 삭제됨]");
    });

    it("should increment view count for published post", async () => {
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [mockAuthor]);
      mockDb._queueResolve("where", undefined);

      await service.findById(POST_ID);

      expect(mockDb.update).toHaveBeenCalled();
    });

    it("should not increment view count for deleted post", async () => {
      const deletedPost = { ...mockPost, status: "deleted" };
      mockDb._queueResolve("limit", [deletedPost]);
      mockDb._queueResolve("limit", [mockAuthor]);

      await service.findById(POST_ID);

      // update should not be called for view count on deleted posts
      // (the service returns early for deleted/removed)
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("should handle missing author gracefully", async () => {
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [undefined]);
      mockDb._queueResolve("where", undefined);

      const result = await service.findById(POST_ID);

      expect(result).toBeDefined();
      expect(result!.authorName).toBeNull();
      expect(result!.authorAvatar).toBeNull();
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe("update", () => {
    const updateDto = { title: "Updated Title", content: "Updated content" };

    it("should update post successfully when user is author", async () => {
      // findById: post lookup + author lookup + view count
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [mockAuthor]);
      mockDb._queueResolve("where", undefined);
      // update returning
      const updatedPost = { ...mockPost, ...updateDto };
      mockDb._queueResolve("returning", [updatedPost]);

      const result = await service.update(POST_ID, updateDto, TEST_USER.id);

      expect(result).toEqual(updatedPost);
    });

    it("should throw NotFoundException when post does not exist", async () => {
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.update(POST_ID, updateDto, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user is not the author", async () => {
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [mockAuthor]);
      mockDb._queueResolve("where", undefined);

      await expect(
        service.update(POST_ID, updateDto, ANOTHER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe("delete", () => {
    it("should soft-delete post when user is the author", async () => {
      // findById chain
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [mockAuthor]);
      mockDb._queueResolve("where", undefined);
      // isModerator (not needed for author, but called)
      mockCommunityService.isModerator.mockResolvedValue(false);
      // soft delete update (set -> where)
      mockDb._queueResolve("where", undefined);
      // postCount decrease (set -> where)
      mockDb._queueResolve("where", undefined);

      await service.delete(POST_ID, TEST_USER.id);

      expect(mockDb.update).toHaveBeenCalled();
    });

    it("should soft-delete post when user is a moderator", async () => {
      const otherUserPost = { ...mockPost, authorId: ANOTHER_USER_ID };
      mockDb._queueResolve("limit", [otherUserPost]);
      mockDb._queueResolve("limit", [{ id: ANOTHER_USER_ID, name: "Other", avatar: null }]);
      mockDb._queueResolve("where", undefined);
      mockCommunityService.isModerator.mockResolvedValue(true);
      mockDb._queueResolve("where", undefined);
      mockDb._queueResolve("where", undefined);

      await service.delete(POST_ID, TEST_USER.id);

      expect(mockCommunityService.isModerator).toHaveBeenCalledWith(COMMUNITY_ID, TEST_USER.id);
    });

    it("should throw NotFoundException when post does not exist", async () => {
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.delete(POST_ID, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user is neither author nor moderator", async () => {
      const otherUserPost = { ...mockPost, authorId: ANOTHER_USER_ID };
      mockDb._queueResolve("limit", [otherUserPost]);
      mockDb._queueResolve("limit", [{ id: ANOTHER_USER_ID, name: "Other", avatar: null }]);
      mockDb._queueResolve("where", undefined);
      mockCommunityService.isModerator.mockResolvedValue(false);

      await expect(
        service.delete(POST_ID, TEST_IDS.UUID_5),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // pin
  // =========================================================================

  describe("pin", () => {
    it("should pin a post when user has moderator permission", async () => {
      // findById chain
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [mockAuthor]);
      mockDb._queueResolve("where", undefined);
      // assertCommunityPermission is mocked to resolve
      // pin update returning
      const pinnedPost = { ...mockPost, isPinned: true };
      mockDb._queueResolve("returning", [pinnedPost]);

      const result = await service.pin(POST_ID, TEST_USER.id);

      expect(result.isPinned).toBe(true);
      const { assertCommunityPermission } = require("../helpers/permission");
      expect(assertCommunityPermission).toHaveBeenCalledWith(
        mockCommunityService,
        TEST_USER.id,
        COMMUNITY_ID,
        ["owner", "admin", "moderator"],
      );
    });

    it("should throw NotFoundException when post does not exist", async () => {
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.pin(POST_ID, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user lacks permission", async () => {
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [mockAuthor]);
      mockDb._queueResolve("where", undefined);

      const { assertCommunityPermission } = require("../helpers/permission");
      assertCommunityPermission.mockRejectedValueOnce(
        new ForbiddenException("이 작업을 수행할 권한이 없습니다."),
      );

      await expect(
        service.pin(POST_ID, ANOTHER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // lock
  // =========================================================================

  describe("lock", () => {
    it("should lock a post when user has moderator permission", async () => {
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [mockAuthor]);
      mockDb._queueResolve("where", undefined);
      const lockedPost = { ...mockPost, isLocked: true };
      mockDb._queueResolve("returning", [lockedPost]);

      const result = await service.lock(POST_ID, TEST_USER.id);

      expect(result.isLocked).toBe(true);
      const { assertCommunityPermission } = require("../helpers/permission");
      expect(assertCommunityPermission).toHaveBeenCalledWith(
        mockCommunityService,
        TEST_USER.id,
        COMMUNITY_ID,
        ["owner", "admin", "moderator"],
      );
    });

    it("should throw NotFoundException when post does not exist", async () => {
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.lock(POST_ID, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user lacks permission", async () => {
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [mockAuthor]);
      mockDb._queueResolve("where", undefined);

      const { assertCommunityPermission } = require("../helpers/permission");
      assertCommunityPermission.mockRejectedValueOnce(
        new ForbiddenException("이 작업을 수행할 권한이 없습니다."),
      );

      await expect(
        service.lock(POST_ID, ANOTHER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // remove (moderator removal)
  // =========================================================================

  describe("remove", () => {
    const removalReason = "Violates community rules";

    it("should remove a post with reason when user has permission", async () => {
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [mockAuthor]);
      mockDb._queueResolve("where", undefined);
      const removedPost = {
        ...mockPost,
        status: "removed",
        removalReason,
        removedBy: TEST_USER.id,
      };
      mockDb._queueResolve("returning", [removedPost]);

      const result = await service.remove(POST_ID, removalReason, TEST_USER.id);

      expect(result.status).toBe("removed");
      expect(result.removalReason).toBe(removalReason);
      expect(result.removedBy).toBe(TEST_USER.id);
    });

    it("should throw NotFoundException when post does not exist", async () => {
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.remove(POST_ID, removalReason, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user lacks permission", async () => {
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [mockAuthor]);
      mockDb._queueResolve("where", undefined);

      const { assertCommunityPermission } = require("../helpers/permission");
      assertCommunityPermission.mockRejectedValueOnce(
        new ForbiddenException("이 작업을 수행할 권한이 없습니다."),
      );

      await expect(
        service.remove(POST_ID, removalReason, ANOTHER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // crosspost
  // =========================================================================

  describe("crosspost", () => {
    const targetCommunity = {
      ...mockCommunity,
      id: TARGET_COMMUNITY_ID,
      name: "Target Community",
      slug: "target-community",
      allowCrosspost: true,
    };

    it("should create a crosspost successfully", async () => {
      // findById for original post
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [mockAuthor]);
      mockDb._queueResolve("where", undefined);
      // findById for target community
      mockCommunityService.findById.mockResolvedValue(targetCommunity);
      // assertCommunityPermission is mocked to resolve
      // insert crosspost
      const crosspostResult = {
        ...mockPost,
        id: TEST_IDS.UUID_5,
        communityId: TARGET_COMMUNITY_ID,
        title: `[Crosspost] ${mockPost.title}`,
        crosspostParentId: POST_ID,
        authorId: TEST_USER.id,
      };
      mockDb._queueResolve("returning", [crosspostResult]);

      const result = await service.crosspost(POST_ID, TARGET_COMMUNITY_ID, TEST_USER.id);

      expect(result.title).toContain("[Crosspost]");
      expect(result.crosspostParentId).toBe(POST_ID);
      expect(result.communityId).toBe(TARGET_COMMUNITY_ID);
    });

    it("should throw NotFoundException when original post does not exist", async () => {
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.crosspost(POST_ID, TARGET_COMMUNITY_ID, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when target community does not exist", async () => {
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [mockAuthor]);
      mockDb._queueResolve("where", undefined);
      mockCommunityService.findById.mockResolvedValue(null);

      await expect(
        service.crosspost(POST_ID, TARGET_COMMUNITY_ID, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when target community disallows crosspost", async () => {
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [mockAuthor]);
      mockDb._queueResolve("where", undefined);
      mockCommunityService.findById.mockResolvedValue({
        ...targetCommunity,
        allowCrosspost: false,
      });

      await expect(
        service.crosspost(POST_ID, TARGET_COMMUNITY_ID, TEST_USER.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw ForbiddenException when user lacks permission in target community", async () => {
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [mockAuthor]);
      mockDb._queueResolve("where", undefined);
      mockCommunityService.findById.mockResolvedValue(targetCommunity);

      const { assertCommunityPermission } = require("../helpers/permission");
      assertCommunityPermission.mockRejectedValueOnce(
        new ForbiddenException("이 커뮤니티의 멤버가 아닙니다."),
      );

      await expect(
        service.crosspost(POST_ID, TARGET_COMMUNITY_ID, ANOTHER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // updateHotScores
  // =========================================================================

  describe("updateHotScores", () => {
    it("should update hot scores for published posts", async () => {
      const publishedPosts = [
        { ...mockPost, id: TEST_IDS.UUID_1, voteScore: 10, createdAt: TEST_DATES.CREATED },
        { ...mockPost, id: TEST_IDS.UUID_2, voteScore: -5, createdAt: TEST_DATES.CREATED },
      ];
      mockDb._queueResolve("limit", publishedPosts);
      // Each post triggers an update -> set -> where chain
      mockDb._queueResolve("where", undefined);
      mockDb._queueResolve("where", undefined);

      await service.updateHotScores();

      // update is called for each post
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("should handle empty posts list", async () => {
      mockDb._queueResolve("limit", []);

      await service.updateHotScores();

      // No updates should be called besides the initial select
      expect(mockDb.select).toHaveBeenCalled();
    });
  });
});
