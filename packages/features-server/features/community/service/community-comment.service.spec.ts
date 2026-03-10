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
    communityComments: createTableMock({
      id: "id",
      postId: "post_id",
      authorId: "author_id",
      parentId: "parent_id",
      content: "content",
      depth: "depth",
      isDeleted: "is_deleted",
      isRemoved: "is_removed",
      removalReason: "removal_reason",
      removedBy: "removed_by",
      isEdited: "is_edited",
      editedAt: "edited_at",
      upvoteCount: "upvote_count",
      downvoteCount: "downvote_count",
      voteScore: "vote_score",
      replyCount: "reply_count",
      isStickied: "is_stickied",
      distinguished: "distinguished",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }),
    communityPosts: createTableMock({
      id: "id",
      communityId: "community_id",
      authorId: "author_id",
      title: "title",
      content: "content",
      type: "type",
      status: "status",
      isPinned: "is_pinned",
      isLocked: "is_locked",
      viewCount: "view_count",
      commentCount: "comment_count",
      lastActivityAt: "last_activity_at",
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
import { CommunityCommentService } from "./community-comment.service";
import { CommunityService } from "./community.service";

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const COMMUNITY_ID = TEST_IDS.UUID_1;
const POST_ID = TEST_IDS.UUID_2;
const COMMENT_ID = TEST_IDS.UUID_3;
const PARENT_COMMENT_ID = TEST_IDS.UUID_4;
const ANOTHER_USER_ID = TEST_IDS.UUID_5;

const mockPost = {
  id: POST_ID,
  communityId: COMMUNITY_ID,
  authorId: TEST_USER.id,
  title: "Test Post",
  content: "Test post content",
  type: "text",
  status: "published",
  isPinned: false,
  isLocked: false,
  viewCount: 0,
  commentCount: 3,
  lastActivityAt: TEST_DATES.CREATED,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const mockComment = {
  id: COMMENT_ID,
  postId: POST_ID,
  authorId: TEST_USER.id,
  parentId: null,
  content: "Test comment",
  depth: 0,
  isDeleted: false,
  isRemoved: false,
  removalReason: null,
  removedBy: null,
  isEdited: false,
  editedAt: null,
  upvoteCount: 0,
  downvoteCount: 0,
  voteScore: 0,
  replyCount: 0,
  isStickied: false,
  distinguished: null,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const mockParentComment = {
  ...mockComment,
  id: PARENT_COMMENT_ID,
  depth: 0,
  replyCount: 1,
};

const mockAuthor = {
  id: TEST_USER.id,
  name: TEST_USER.name,
  avatar: null,
};

const createCommentDto = {
  postId: POST_ID,
  content: "New comment content",
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("CommunityCommentService", () => {
  let service: CommunityCommentService;
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
        CommunityCommentService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: CommunityService, useValue: mockCommunityService },
      ],
    }).compile();

    service = module.get<CommunityCommentService>(CommunityCommentService);
  });

  afterEach(() => {
    mockDb._resetQueue();
    jest.clearAllMocks();
  });

  // =========================================================================
  // create
  // =========================================================================

  describe("create", () => {
    it("should create a top-level comment successfully", async () => {
      // post lookup
      mockDb._queueResolve("limit", [mockPost]);
      // insert comment returning
      mockDb._queueResolve("returning", [mockComment]);
      // update post commentCount (set -> where)
      mockDb._queueResolve("where", undefined);

      const result = await service.create(createCommentDto, TEST_USER.id);

      expect(result).toEqual(mockComment);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should create a reply comment with correct depth", async () => {
      const replyDto = {
        ...createCommentDto,
        parentId: PARENT_COMMENT_ID,
      };

      // post lookup
      mockDb._queueResolve("limit", [mockPost]);
      // findById for parent comment
      mockDb._queueResolve("limit", [mockParentComment]);
      // insert comment returning
      const replyComment = { ...mockComment, parentId: PARENT_COMMENT_ID, depth: 1 };
      mockDb._queueResolve("returning", [replyComment]);
      // update post commentCount
      mockDb._queueResolve("where", undefined);
      // update parent replyCount
      mockDb._queueResolve("where", undefined);

      const result = await service.create(replyDto, TEST_USER.id);

      expect(result.depth).toBe(1);
      expect(result.parentId).toBe(PARENT_COMMENT_ID);
    });

    it("should throw NotFoundException when post does not exist", async () => {
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.create(createCommentDto, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when post is locked", async () => {
      const lockedPost = { ...mockPost, isLocked: true };
      mockDb._queueResolve("limit", [lockedPost]);

      await expect(
        service.create(createCommentDto, TEST_USER.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw NotFoundException when parent comment does not exist", async () => {
      const replyDto = {
        ...createCommentDto,
        parentId: PARENT_COMMENT_ID,
      };
      // post lookup
      mockDb._queueResolve("limit", [mockPost]);
      // findById for parent (not found)
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.create(replyDto, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should handle nested reply with depth > 1", async () => {
      const deepParent = { ...mockParentComment, depth: 3 };
      const replyDto = {
        ...createCommentDto,
        parentId: PARENT_COMMENT_ID,
      };

      // post lookup
      mockDb._queueResolve("limit", [mockPost]);
      // findById for deep parent
      mockDb._queueResolve("limit", [deepParent]);
      // insert returning
      const deepReply = { ...mockComment, parentId: PARENT_COMMENT_ID, depth: 4 };
      mockDb._queueResolve("returning", [deepReply]);
      // update post commentCount
      mockDb._queueResolve("where", undefined);
      // update parent replyCount
      mockDb._queueResolve("where", undefined);

      const result = await service.create(replyDto, TEST_USER.id);

      expect(result.depth).toBe(4);
    });

    it("should increment post commentCount and update lastActivityAt", async () => {
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("returning", [mockComment]);
      mockDb._queueResolve("where", undefined);

      await service.create(createCommentDto, TEST_USER.id);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });

    it("should increment parent replyCount when replying", async () => {
      const replyDto = { ...createCommentDto, parentId: PARENT_COMMENT_ID };

      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("limit", [mockParentComment]);
      mockDb._queueResolve("returning", [{ ...mockComment, parentId: PARENT_COMMENT_ID, depth: 1 }]);
      mockDb._queueResolve("where", undefined);
      mockDb._queueResolve("where", undefined);

      await service.create(replyDto, TEST_USER.id);

      // update called for both post commentCount and parent replyCount
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // findByPost
  // =========================================================================

  describe("findByPost", () => {
    it("should return comments for a post with default options", async () => {
      const comments = [mockComment];
      mockDb._queueResolve("limit", comments);
      // author lookup
      mockDb._queueResolve("where", [mockAuthor]);

      const result = await service.findByPost({ postId: POST_ID });

      expect(result).toBeDefined();
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should sort by newest when sort=new", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.findByPost({ postId: POST_ID, sort: "new" });

      expect(result).toBeDefined();
    });

    it("should sort by oldest by default", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.findByPost({ postId: POST_ID });

      expect(result).toBeDefined();
    });

    it("should handle cursor pagination with new sort", async () => {
      const { decodeCursor } = require("@/shared/utils/pagination");
      decodeCursor.mockReturnValueOnce({ value: "2026-01-01T00:00:00.000Z", id: COMMENT_ID });
      mockDb._queueResolve("limit", []);

      await service.findByPost({ postId: POST_ID, sort: "new", cursor: "some-cursor" });

      expect(decodeCursor).toHaveBeenCalledWith("some-cursor");
    });

    it("should handle cursor pagination with old sort (default)", async () => {
      const { decodeCursor } = require("@/shared/utils/pagination");
      decodeCursor.mockReturnValueOnce({ value: "2026-01-01T00:00:00.000Z", id: COMMENT_ID });
      mockDb._queueResolve("limit", []);

      await service.findByPost({ postId: POST_ID, cursor: "some-cursor" });

      expect(decodeCursor).toHaveBeenCalledWith("some-cursor");
    });

    it("should enrich comments with author data", async () => {
      const comments = [mockComment];
      mockDb._queueResolve("limit", comments);
      mockDb._queueResolve("where", [mockAuthor]);

      const { buildCursorResult } = require("@/shared/utils/pagination");
      buildCursorResult.mockImplementationOnce((data: any[]) => ({
        data,
        nextCursor: null,
        hasMore: false,
      }));

      const result = await service.findByPost({ postId: POST_ID });

      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it("should use custom limit when provided", async () => {
      mockDb._queueResolve("limit", []);

      await service.findByPost({ postId: POST_ID, limit: 10 });

      expect(mockDb.limit).toHaveBeenCalledWith(11);
    });

    it("should return empty result when no comments found", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.findByPost({ postId: POST_ID });

      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // findById
  // =========================================================================

  describe("findById", () => {
    it("should return comment when found", async () => {
      mockDb._queueResolve("limit", [mockComment]);

      const result = await service.findById(COMMENT_ID);

      expect(result).toEqual(mockComment);
    });

    it("should return null when comment not found", async () => {
      mockDb._queueResolve("limit", [undefined]);

      const result = await service.findById(COMMENT_ID);

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe("update", () => {
    const newContent = "Updated comment content";

    it("should update comment when user is the author", async () => {
      // findById
      mockDb._queueResolve("limit", [mockComment]);
      // update returning
      const updatedComment = {
        ...mockComment,
        content: newContent,
        isEdited: true,
        editedAt: TEST_DATES.NOW,
      };
      mockDb._queueResolve("returning", [updatedComment]);

      const result = await service.update(COMMENT_ID, newContent, TEST_USER.id);

      expect(result.content).toBe(newContent);
      expect(result.isEdited).toBe(true);
    });

    it("should throw NotFoundException when comment does not exist", async () => {
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.update(COMMENT_ID, newContent, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user is not the author", async () => {
      mockDb._queueResolve("limit", [mockComment]);

      await expect(
        service.update(COMMENT_ID, newContent, ANOTHER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe("delete", () => {
    it("should soft-delete comment when user is the author", async () => {
      // findById for comment
      mockDb._queueResolve("limit", [mockComment]);
      // post lookup
      mockDb._queueResolve("limit", [mockPost]);
      // isModerator
      mockCommunityService.isModerator.mockResolvedValue(false);
      // soft delete (set -> where)
      mockDb._queueResolve("where", undefined);
      // decrease commentCount (set -> where)
      mockDb._queueResolve("where", undefined);

      await service.delete(COMMENT_ID, TEST_USER.id);

      expect(mockDb.update).toHaveBeenCalled();
    });

    it("should soft-delete comment when user is a moderator", async () => {
      const otherComment = { ...mockComment, authorId: ANOTHER_USER_ID };
      // findById for comment
      mockDb._queueResolve("limit", [otherComment]);
      // post lookup
      mockDb._queueResolve("limit", [mockPost]);
      // isModerator
      mockCommunityService.isModerator.mockResolvedValue(true);
      // soft delete
      mockDb._queueResolve("where", undefined);
      // decrease commentCount
      mockDb._queueResolve("where", undefined);

      await service.delete(COMMENT_ID, TEST_USER.id);

      expect(mockCommunityService.isModerator).toHaveBeenCalledWith(COMMUNITY_ID, TEST_USER.id);
    });

    it("should throw NotFoundException when comment does not exist", async () => {
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.delete(COMMENT_ID, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when post does not exist", async () => {
      mockDb._queueResolve("limit", [mockComment]);
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.delete(COMMENT_ID, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user is neither author nor moderator", async () => {
      const otherComment = { ...mockComment, authorId: ANOTHER_USER_ID };
      mockDb._queueResolve("limit", [otherComment]);
      mockDb._queueResolve("limit", [mockPost]);
      mockCommunityService.isModerator.mockResolvedValue(false);

      await expect(
        service.delete(COMMENT_ID, TEST_IDS.UUID_1),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should decrease post commentCount after deletion", async () => {
      mockDb._queueResolve("limit", [mockComment]);
      mockDb._queueResolve("limit", [mockPost]);
      mockCommunityService.isModerator.mockResolvedValue(false);
      mockDb._queueResolve("where", undefined);
      mockDb._queueResolve("where", undefined);

      await service.delete(COMMENT_ID, TEST_USER.id);

      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // remove (moderator removal)
  // =========================================================================

  describe("remove", () => {
    const removalReason = "Violates community rules";

    it("should remove a comment with reason when user has permission", async () => {
      // findById for comment
      mockDb._queueResolve("limit", [mockComment]);
      // post lookup
      mockDb._queueResolve("limit", [mockPost]);
      // assertCommunityPermission is mocked
      // update returning
      const removedComment = {
        ...mockComment,
        isRemoved: true,
        removalReason,
        removedBy: TEST_USER.id,
        content: "[removed]",
      };
      mockDb._queueResolve("returning", [removedComment]);

      const result = await service.remove(COMMENT_ID, removalReason, TEST_USER.id);

      expect(result.isRemoved).toBe(true);
      expect(result.removalReason).toBe(removalReason);
      expect(result.content).toBe("[removed]");
    });

    it("should throw NotFoundException when comment does not exist", async () => {
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.remove(COMMENT_ID, removalReason, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when post does not exist", async () => {
      mockDb._queueResolve("limit", [mockComment]);
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.remove(COMMENT_ID, removalReason, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user lacks permission", async () => {
      mockDb._queueResolve("limit", [mockComment]);
      mockDb._queueResolve("limit", [mockPost]);

      const { assertCommunityPermission } = require("../helpers/permission");
      assertCommunityPermission.mockRejectedValueOnce(
        new ForbiddenException("이 작업을 수행할 권한이 없습니다."),
      );

      await expect(
        service.remove(COMMENT_ID, removalReason, ANOTHER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should call assertCommunityPermission with moderator roles", async () => {
      mockDb._queueResolve("limit", [mockComment]);
      mockDb._queueResolve("limit", [mockPost]);
      const removedComment = { ...mockComment, isRemoved: true };
      mockDb._queueResolve("returning", [removedComment]);

      await service.remove(COMMENT_ID, removalReason, TEST_USER.id);

      const { assertCommunityPermission } = require("../helpers/permission");
      expect(assertCommunityPermission).toHaveBeenCalledWith(
        mockCommunityService,
        TEST_USER.id,
        COMMUNITY_ID,
        ["owner", "admin", "moderator"],
      );
    });
  });

  // =========================================================================
  // sticky
  // =========================================================================

  describe("sticky", () => {
    it("should sticky a comment when user has permission", async () => {
      // findById for comment
      mockDb._queueResolve("limit", [mockComment]);
      // post lookup
      mockDb._queueResolve("limit", [mockPost]);
      // assertCommunityPermission is mocked
      // update returning
      const stickiedComment = { ...mockComment, isStickied: true };
      mockDb._queueResolve("returning", [stickiedComment]);

      const result = await service.sticky(COMMENT_ID, TEST_USER.id);

      expect(result.isStickied).toBe(true);
    });

    it("should throw NotFoundException when comment does not exist", async () => {
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.sticky(COMMENT_ID, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when post does not exist", async () => {
      mockDb._queueResolve("limit", [mockComment]);
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.sticky(COMMENT_ID, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user lacks permission", async () => {
      mockDb._queueResolve("limit", [mockComment]);
      mockDb._queueResolve("limit", [mockPost]);

      const { assertCommunityPermission } = require("../helpers/permission");
      assertCommunityPermission.mockRejectedValueOnce(
        new ForbiddenException("이 작업을 수행할 권한이 없습니다."),
      );

      await expect(
        service.sticky(COMMENT_ID, ANOTHER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should call assertCommunityPermission with moderator roles", async () => {
      mockDb._queueResolve("limit", [mockComment]);
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("returning", [{ ...mockComment, isStickied: true }]);

      await service.sticky(COMMENT_ID, TEST_USER.id);

      const { assertCommunityPermission } = require("../helpers/permission");
      expect(assertCommunityPermission).toHaveBeenCalledWith(
        mockCommunityService,
        TEST_USER.id,
        COMMUNITY_ID,
        ["owner", "admin", "moderator"],
      );
    });
  });

  // =========================================================================
  // distinguish
  // =========================================================================

  describe("distinguish", () => {
    it("should distinguish a comment when user is the author and has permission", async () => {
      // findById for comment
      mockDb._queueResolve("limit", [mockComment]);
      // post lookup
      mockDb._queueResolve("limit", [mockPost]);
      // assertCommunityPermission is mocked
      // update returning
      const distinguishedComment = { ...mockComment, distinguished: "moderator" };
      mockDb._queueResolve("returning", [distinguishedComment]);

      const result = await service.distinguish(COMMENT_ID, TEST_USER.id);

      expect(result.distinguished).toBe("moderator");
    });

    it("should throw NotFoundException when comment does not exist", async () => {
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.distinguish(COMMENT_ID, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user is not the author", async () => {
      const otherComment = { ...mockComment, authorId: ANOTHER_USER_ID };
      mockDb._queueResolve("limit", [otherComment]);

      await expect(
        service.distinguish(COMMENT_ID, TEST_USER.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw NotFoundException when post does not exist", async () => {
      mockDb._queueResolve("limit", [mockComment]);
      // post not found
      mockDb._queueResolve("limit", [undefined]);

      await expect(
        service.distinguish(COMMENT_ID, TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user lacks moderator permission", async () => {
      mockDb._queueResolve("limit", [mockComment]);
      mockDb._queueResolve("limit", [mockPost]);

      const { assertCommunityPermission } = require("../helpers/permission");
      assertCommunityPermission.mockRejectedValueOnce(
        new ForbiddenException("이 작업을 수행할 권한이 없습니다."),
      );

      await expect(
        service.distinguish(COMMENT_ID, TEST_USER.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should call assertCommunityPermission with moderator roles", async () => {
      mockDb._queueResolve("limit", [mockComment]);
      mockDb._queueResolve("limit", [mockPost]);
      mockDb._queueResolve("returning", [{ ...mockComment, distinguished: "moderator" }]);

      await service.distinguish(COMMENT_ID, TEST_USER.id);

      const { assertCommunityPermission } = require("../helpers/permission");
      expect(assertCommunityPermission).toHaveBeenCalledWith(
        mockCommunityService,
        TEST_USER.id,
        COMMUNITY_ID,
        ["owner", "admin", "moderator"],
      );
    });
  });
});
